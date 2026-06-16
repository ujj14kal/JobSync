"""
Job description scraper — multi-strategy, platform-aware.

Strategy order (URL-only mode):
  1. LinkedIn guest API  (no auth, instant JSON)
  2. httpx lightweight   (Greenhouse, Lever, static pages)
  3. Playwright full JS  (Indeed, Workday, dynamic career pages)
  4. LLM synthetic       (last resort — generates a realistic JD from metadata)

Metadata extraction (title + company) runs on every scraped page via:
  - JSON-LD  @type:JobPosting  (most reliable — LinkedIn, Greenhouse, Lever, Indeed)
  - <title>  tag patterns      (e.g. "Product Manager at Google | LinkedIn")
  - OpenGraph og:title

The extracted metadata is passed to the LLM so it always knows the real job
title/company, even when only a URL is given — fixing the PM→SWE misidentification.
"""
from __future__ import annotations

import asyncio
import re
import json
from typing import Optional
from urllib.parse import urlparse, parse_qs

import httpx
from bs4 import BeautifulSoup
import structlog

from app.core.config import settings

logger = structlog.get_logger()


# ─── Metadata Extraction (title + company from page head) ────────────────────

def extract_metadata_from_html(html: str, url: str = "") -> dict:
    """
    Reliably extract job title and company from page metadata.

    Priority:
      1. JSON-LD structured data (@type: JobPosting)  — most sites emit this
      2. <title> tag  — LinkedIn/Indeed always encode "Title at Company | Site"
      3. OpenGraph og:title / og:site_name

    Returns {"title": str, "company": str} — both may be empty strings.
    """
    soup = BeautifulSoup(html, "lxml")
    title = ""
    company = ""

    # 1. JSON-LD structured data ─────────────────────────────────────────────
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            raw_json = script.string or ""
            if not raw_json.strip():
                continue
            data = json.loads(raw_json)
            # Handle arrays
            if isinstance(data, list):
                data = next((d for d in data if isinstance(d, dict)), {})
            if not isinstance(data, dict):
                continue
            if data.get("@type") in ("JobPosting", "jobPosting"):
                title = str(data.get("title", "")).strip()
                org = data.get("hiringOrganization", {})
                if isinstance(org, dict):
                    company = str(org.get("name", "")).strip()
                elif isinstance(org, str):
                    company = org.strip()
                if title:
                    logger.debug("Metadata from JSON-LD", title=title, company=company)
                    return {"title": title, "company": company}
        except Exception:
            pass

    # 2. <title> tag  ────────────────────────────────────────────────────────
    page_title_el = soup.find("title")
    if page_title_el:
        raw = page_title_el.get_text(strip=True)

        # Skip generic titles that are just the site name
        skip_words = {"linkedin", "indeed", "glassdoor", "naukri", "jobs", "careers", "search"}

        # Pattern family A: "Title at Company | Site"  or  "Title at Company - Site"
        m = re.match(
            r"^(.+?)\s+(?:at|@)\s+(.+?)\s*[|\-–·]\s*.+$", raw, re.IGNORECASE
        )
        if m:
            cand_title = m.group(1).strip()
            cand_company = m.group(2).strip()
            if not any(w in cand_title.lower() for w in skip_words):
                title, company = cand_title, cand_company

        # Pattern family B: "Title at Company"  (no separator at end)
        if not title:
            m = re.match(r"^(.+?)\s+(?:at|@)\s+(.+)$", raw, re.IGNORECASE)
            if m:
                cand_title = m.group(1).strip()
                cand_company = m.group(2).strip()
                if not any(w in cand_title.lower() for w in skip_words):
                    title, company = cand_title, cand_company

        # Pattern family C: "Title - Company"  (Lever, Ashby)
        if not title:
            m = re.match(r"^(.+?)\s+[–\-]\s+(.+)$", raw)
            if m:
                cand_title = m.group(1).strip()
                cand_company = m.group(2).strip()
                if (
                    not any(w in cand_title.lower() for w in skip_words)
                    and len(cand_title) > 4
                ):
                    title, company = cand_title, cand_company

        # Pattern family D: "Company: Title"  (some Greenhouse pages)
        if not title:
            m = re.match(r"^(.+?):\s+(.+)$", raw)
            if m and len(m.group(2)) > len(m.group(1)):
                company, title = m.group(1).strip(), m.group(2).strip()

        if title:
            logger.debug("Metadata from <title>", title=title, company=company)
            return {"title": title, "company": company}

    # 3. OpenGraph  ──────────────────────────────────────────────────────────
    og_title = (
        soup.find("meta", property="og:title") or
        soup.find("meta", attrs={"name": "og:title"})
    )
    if og_title:
        raw = og_title.get("content", "").strip()
        m = re.match(r"^(.+?)\s+(?:at|@)\s+(.+)$", raw, re.IGNORECASE)
        if m:
            title = m.group(1).strip()
            company = m.group(2).strip()

    # 4. h1 page heading as last resort — only trusted on known job board domains
    if not title:
        # Any known job domain gets h1 fallback trust
        trusted_domains = _JOB_DOMAINS
        parsed_host = urlparse(url).netloc.lower().lstrip("www.")
        if any(parsed_host == d or parsed_host.endswith("." + d) for d in trusted_domains):
            for h1 in soup.find_all("h1"):
                text = h1.get_text(strip=True)
                if 5 < len(text) < 120:
                    title = text
                    break

    logger.debug("Metadata fallback result", title=title, company=company)
    return {"title": title, "company": company}


# ─── URL Normalizers ─────────────────────────────────────────────────────────

_STRIP_PARAMS = {"mode", "tracking_id", "trk", "src", "ref", "referer", "utm_source", "utm_medium", "utm_campaign"}


def normalize_job_url(url: str) -> str:
    """Strip display/tracking params that can trigger modals or redirect loops."""
    try:
        from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
        parsed = urlparse(url)
        qs = parse_qs(parsed.query, keep_blank_values=True)
        cleaned = {k: v for k, v in qs.items() if k.lower() not in _STRIP_PARAMS}
        new_query = urlencode(cleaned, doseq=True)
        return urlunparse(parsed._replace(query=new_query))
    except Exception:
        return url


# ─── LinkedIn Guest API ──────────────────────────────────────────────────────

def _linkedin_job_id(url: str) -> Optional[str]:
    """Extract job ID from any LinkedIn jobs URL variant."""
    # /jobs/view/1234567890/ or /comm/jobs/view/1234567890 (tracking links)
    m = re.search(r"/jobs/view/(?:[^/]+?-)?(\d{7,})", url)
    if m:
        return m.group(1)
    # ?currentJobId=… or ?jobId=…
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    for key in ("currentJobId", "jobId", "job_id"):
        if key in qs:
            return qs[key][0]
    # /jobs/collections/…?currentJobId=… already covered above
    # jobPosting numeric slug at end: linkedin.com/jobs/view/title-at-co-1234567890
    m2 = re.search(r"-(\d{7,})/?$", url.split("?")[0])
    if m2:
        return m2.group(1)
    return None


async def scrape_linkedin_guest_api(url: str) -> Optional[tuple[str, dict]]:
    """
    Use LinkedIn's unauthenticated guest job API.
    Returns (raw_html, metadata_dict) or None.
    No login required — works reliably for public job posts.
    """
    job_id = _linkedin_job_id(url)
    if not job_id:
        return None

    api_url = f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.linkedin.com/",
    }
    try:
        async with httpx.AsyncClient(timeout=20, headers=headers, follow_redirects=True) as client:
            resp = await client.get(api_url)
            if resp.status_code == 200 and len(resp.text) > 500:
                meta = extract_metadata_from_html(resp.text, url)
                # Guest API HTML has the description in specific elements
                soup = BeautifulSoup(resp.text, "lxml")
                desc_el = (
                    soup.find("div", class_="show-more-less-html__markup") or
                    soup.find("section", class_="description") or
                    soup.find("div", {"class": re.compile(r"description|job-details", re.I)})
                )
                if desc_el:
                    text = desc_el.get_text(separator="\n", strip=True)
                    if len(text) > 200:
                        logger.info("LinkedIn guest API success", job_id=job_id, chars=len(text))
                        return text, meta
    except Exception as e:
        logger.warning("LinkedIn guest API failed", job_id=job_id, error=str(e))
    return None


# ─── HTTP / Playwright Scrapers ──────────────────────────────────────────────

_LOGIN_SIGNALS = [
    "sign in to", "log in to", "create an account", "join linkedin",
    "sign up", "verify you're human", "access denied", "403 forbidden",
    "please enable javascript", "captcha", "robot check",
    "you have been blocked", "cloudflare", "just a moment",
]

_JOB_SIGNALS = [
    # Universal
    "responsibilities", "requirements", "qualifications", "skills",
    "experience", "job description", "about the role", "what you'll do",
    "we are looking", "we're looking", "apply now", "job type",
    "full-time", "part-time", "benefits", "compensation", "salary",
    "who you are", "what you bring", "about you", "your role",
    "duties", "key responsibilities", "essential functions",
    "minimum qualifications", "preferred qualifications",
    "equal opportunity", "eeo", "we offer", "what we offer",
    # Healthcare / pharma
    "patient care", "clinical", "nursing", "medical", "healthcare",
    "hospital", "physician", "licensed", "certification required",
    # Finance / banking
    "financial", "banking", "investment", "accounting", "audit",
    "compliance", "portfolio", "underwriting",
    # Retail / hospitality
    "customer service", "retail", "store", "shift", "hospitality",
    "food service", "guest experience", "inventory",
    # Manufacturing / logistics
    "manufacturing", "production", "warehouse", "logistics", "supply chain",
    "forklift", "safety standards", "quality control",
    # Education
    "teaching", "educator", "faculty", "curriculum", "classroom",
    "academic", "students",
    # Legal / consulting
    "counsel", "attorney", "litigation", "consulting", "advisory",
]


def _is_blocked_page(text: str) -> bool:
    """Return True if the extracted text looks like a login wall or bot block."""
    lower = text.lower()[:2000]
    signal_hits = sum(1 for s in _LOGIN_SIGNALS if s in lower)
    return signal_hits >= 2


def _clean_jina_markdown(text: str) -> str:
    """
    Strip Jina markdown noise: navigation links, cookie banners, repeated
    short lines. Keeps sections that contain job-relevant content.
    """
    lines = text.splitlines()
    cleaned = []
    for line in lines:
        stripped = line.strip()
        # Drop bare markdown links with no context (nav items)
        if re.match(r"^\[.{1,40}\]\(http", stripped) and len(stripped) < 80:
            continue
        # Drop very short lines that are just menu items / separators
        if len(stripped) < 4 and stripped not in ("", "-", "*"):
            continue
        cleaned.append(line)

    result = "\n".join(cleaned)

    # Try to focus on the job-relevant section of the page
    lower = result.lower()
    job_anchors = [
        "responsibilities", "requirements", "qualifications",
        "about the role", "about this role", "job description",
        "what you'll do", "what we're looking for",
    ]
    best_start = len(result)
    for anchor in job_anchors:
        idx = lower.find(anchor)
        if 0 < idx < best_start:
            best_start = idx

    # If a job anchor exists, keep 500 chars of context before it + everything after
    if best_start < len(result) * 0.8:
        result = result[max(0, best_start - 500):]

    return result.strip()


async def scrape_url_with_firecrawl(url: str) -> Optional[tuple[str, dict]]:
    """
    Use Firecrawl (firecrawl.dev) to scrape a URL into clean markdown.
    Free tier: 500 pages/month. Only runs if FIRECRAWL_API_KEY is set.
    Returns (content_text, metadata_dict) or None.
    """
    if not settings.FIRECRAWL_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.post(
                "https://api.firecrawl.dev/v1/scrape",
                headers={
                    "Authorization": f"Bearer {settings.FIRECRAWL_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "url": url,
                    "formats": ["markdown"],
                    "onlyMainContent": True,
                    "excludeTags": ["nav", "header", "footer", "aside", ".cookie", ".banner"],
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                text = (data.get("data") or {}).get("markdown", "").strip()
                if text and len(text) > 300 and not _is_blocked_page(text):
                    meta = {"title": "", "company": ""}
                    page_meta = (data.get("data") or {}).get("metadata", {})
                    raw_title = page_meta.get("title", "") or page_meta.get("ogTitle", "")
                    if raw_title:
                        m = re.match(r"^(.+?)\s+(?:at|@)\s+(.+?)(?:\s*[\|\-]|$)", raw_title, re.IGNORECASE)
                        if m:
                            meta["title"] = m.group(1).strip()
                            meta["company"] = m.group(2).strip()
                        else:
                            meta["title"] = raw_title
                    logger.info("Firecrawl success", url=url, chars=len(text))
                    return _clean_jina_markdown(text), meta
    except Exception as e:
        logger.warning("Firecrawl failed", url=url, error=str(e))
    return None


async def scrape_url_with_jina(url: str) -> Optional[tuple[str, dict]]:
    """
    Use Jina AI Reader (r.jina.ai) to extract clean markdown from any URL.
    Free, no API key needed; set JINA_API_KEY for higher rate limits.
    Returns (content_text, metadata_dict) or None.
    """
    try:
        jina_url = f"https://r.jina.ai/{url}"
        headers: dict = {
            "Accept": "text/plain, text/markdown",
            "X-Return-Format": "markdown",
            "X-Remove-Selector": "header,footer,nav,.cookie-banner,.newsletter,#cookie-policy",
            "X-Target-Selector": "main,article,[class*='job-description'],[class*='description'],[id*='job']",
        }
        if settings.JINA_API_KEY:
            headers["Authorization"] = f"Bearer {settings.JINA_API_KEY}"
        async with httpx.AsyncClient(
            timeout=25,
            follow_redirects=True,
            headers=headers,
        ) as client:
            resp = await client.get(jina_url)
            if resp.status_code == 200:
                raw = resp.text.strip()
                if not raw or len(raw) < 300:
                    return None
                # Reject login walls and bot-blocked pages
                if _is_blocked_page(raw):
                    logger.warning("Jina returned login/block page", url=url)
                    return None
                text = _clean_jina_markdown(raw)
                if len(text) < 200:
                    return None
                # Extract title/company from first meaningful heading
                meta = {"title": "", "company": ""}
                for line in text.splitlines()[:30]:
                    line = line.strip().lstrip("#").strip()
                    if not line or len(line) < 4:
                        continue
                    m = re.match(r"^(.+?)\s+(?:at|@)\s+(.+)$", line, re.IGNORECASE)
                    if m:
                        meta["title"] = m.group(1).strip()
                        meta["company"] = m.group(2).strip()
                        break
                    if not meta["title"] and 5 < len(line) < 120:
                        meta["title"] = line
                logger.info("Jina Reader success", url=url, chars=len(text))
                return text, meta
    except Exception as e:
        logger.warning("Jina Reader failed", url=url, error=str(e))
    return None


async def scrape_url_with_httpx(url: str) -> Optional[str]:
    """Lightweight HTTP scrape for non-JS pages (Greenhouse, Lever, static career pages)."""
    try:
        async with httpx.AsyncClient(
            timeout=20,
            follow_redirects=True,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/125.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Cache-Control": "no-cache",
                "sec-ch-ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "none",
                "upgrade-insecure-requests": "1",
            },
        ) as client:
            resp = await client.get(url)
            if resp.status_code == 200 and len(resp.text) > 800:
                return resp.text
    except Exception as e:
        logger.warning("httpx scrape failed", url=url, error=str(e))
    return None




async def scrape_url_with_playwright(url: str, timeout: int = 35) -> Optional[str]:
    """
    Full Playwright scrape with stealth mode — always waits for networkidle so
    JS SPAs (Workday, Honeywell, iCIMS, SuccessFactors, etc.) fully render.
    No domain list needed — networkidle works universally.
    """
    try:
        from playwright.async_api import async_playwright
        try:
            from playwright_stealth import stealth_async
            _stealth_available = True
        except ImportError:
            _stealth_available = False

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-web-security",
                    "--disable-features=VizDisplayCompositor",
                ],
            )
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/125.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1440, "height": 900},
                locale="en-US",
                timezone_id="America/New_York",
                java_script_enabled=True,
                accept_downloads=False,
                extra_http_headers={
                    "Accept-Language": "en-US,en;q=0.9",
                    "sec-ch-ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": '"Windows"',
                },
            )
            page = await context.new_page()
            if _stealth_available:
                await stealth_async(page)

            # Block heavy resources
            await page.route(
                "**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,otf,mp4,mp3}",
                lambda r: r.abort(),
            )

            try:
                await page.goto(url, wait_until="networkidle", timeout=timeout * 1000)

                # Wait up to 5s for the job description to appear
                desc_selectors = [
                    "div.jobs-description__content",
                    "div#jobDescriptionText",
                    "div.job-post-description",
                    "div[class*='description']",
                    "section.description",
                    "div[data-automation='jobAdDetails']",
                    "div.content",
                    "main",
                ]
                for sel in desc_selectors:
                    try:
                        await page.wait_for_selector(sel, timeout=3000)
                        break
                    except Exception:
                        pass

                await page.wait_for_timeout(1500)

                # Expand "Show more" / "See more" buttons
                for selector in [
                    "button.show-more-less-html__button",
                    "button[aria-label*='see more' i]",
                    "[data-automation='job-description-toggle']",
                    "button:has-text('Show more')",
                    "button:has-text('See more')",
                    "button:has-text('Read more')",
                ]:
                    try:
                        await page.click(selector, timeout=1500)
                        await page.wait_for_timeout(800)
                    except Exception:
                        pass

                html = await page.content()
                return html if len(html) > 800 else None
            except Exception as e:
                logger.warning("Playwright navigation failed", url=url, error=str(e))
                return None
            finally:
                await browser.close()

    except Exception as e:
        logger.error("Playwright launch failed", error=str(e))
        return None


# ─── Content Extraction from HTML ────────────────────────────────────────────

_GENERIC_SELECTORS = [
    # Semantic job-description containers (works across most ATS platforms)
    "[data-automation-id='jobPostingDescription']",   # Workday
    "[data-automation='jobAdDetails']",               # Seek
    "div.iCIMS_JobContent",                           # iCIMS
    "div#jobDescriptionText",                         # Indeed
    "div.jobs-description__content",                  # LinkedIn
    "div.show-more-less-html__markup",                # LinkedIn guest API
    "div.job-post-description",                       # Greenhouse
    "div[class*='job-description']",
    "div[id*='job-description']",
    "div[class*='jobDescription']",
    "div[class*='job-details']",
    "div[class*='description__text']",
    "section[class*='description']",
    "article[class*='job']",
    "article",
    "main",
]


def extract_job_content_from_html(html: str, url: str) -> Optional[str]:
    """
    Extract job description text from HTML using generic selectors only.
    No hardcoded domain lists — falls back to the largest text block.
    """
    soup = BeautifulSoup(html, "lxml")

    for tag in soup.find_all([
        "script", "style", "nav", "header", "footer", "iframe",
        "noscript", "aside", "form", "svg",
    ]):
        tag.decompose()

    for selector in _GENERIC_SELECTORS:
        try:
            el = soup.select_one(selector)
        except Exception:
            continue
        if el:
            text = el.get_text(separator="\n", strip=True)
            if len(text) > 300:
                return _clean_text(text)

    # Final fallback: the single element with the most text content
    all_divs = soup.find_all(["div", "section", "article"])
    if all_divs:
        best = max(all_divs, key=lambda d: len(d.get_text()), default=None)
        if best:
            text = best.get_text(separator="\n", strip=True)
            if len(text) > 300:
                return _clean_text(text[:12000])

    return None


def _clean_text(text: str) -> str:
    """Remove repeated whitespace/blank lines from extracted text."""
    lines = [line.strip() for line in text.splitlines()]
    # Drop lines that are just noise (very short or purely punctuation)
    lines = [l for l in lines if len(l) > 1]
    # Collapse more than 2 consecutive blank lines
    result, blanks = [], 0
    for line in lines:
        if line == "":
            blanks += 1
            if blanks <= 2:
                result.append(line)
        else:
            blanks = 0
            result.append(line)
    return "\n".join(result).strip()


# ─── LLM-based Job Parser ─────────────────────────────────────────────────────

async def extract_job_details_with_llm(
    raw_text: str,
    hint_title: str = "",
    hint_company: str = "",
    url: str = "",
) -> dict:
    """
    Parse structured job data from raw text using Groq.

    hint_title / hint_company come from page metadata (JSON-LD / <title> tag)
    and act as an anchor so the model doesn't hallucinate a different role.
    """
    from app.services.groq_limiter import groq_call

    hint_block = ""
    if hint_title or hint_company:
        hint_block = (
            f"IMPORTANT: This job is titled \"{hint_title}\" at \"{hint_company}\". "
            "Always use these exact values for title and company — never substitute a different role.\n\n"
        )

    prompt = (
        f"{hint_block}"
        "You are a job description parser. Extract every piece of structured information "
        "from the text below, even if the text is noisy, partial, or mixed with page chrome.\n"
        "This may be ANY industry — tech, healthcare, finance, retail, manufacturing, education, legal, etc.\n"
        "Rules:\n"
        "- title: the exact job role name (e.g. 'Staff Nurse', 'Financial Analyst', 'Store Manager', 'Software Engineer')\n"
        "- required_skills: concrete skills/tools/certifications explicitly required (strings, no duplicates)\n"
        "- tech_stack: tools, software, equipment, or frameworks mentioned (can be medical tools, ERP systems, machinery, etc.)\n"
        "- If a field has no data in the text, return [] or '' — never invent data\n"
        "- Even if the text is partial, extract what is present\n\n"
        f"URL: {url}\n\n"
        f"Text (first 8000 chars):\n{raw_text[:8000]}\n\n"
        "Return JSON only:\n"
        '{"title":"","company":"","location":"","job_type":"","experience_level":"",'
        '"salary_range":null,"requirements":[],"responsibilities":[],"required_skills":[],'
        '"preferred_skills":[],"qualifications":[],"tech_stack":[],"keywords":[],"about_company":""}'
    )

    try:
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=1200,
            json_mode=True,
            use_cache=True,
            cache_ttl=86400,
        )
        parsed = json.loads(raw)

        # Post-process: if LLM returned empty/generic title, use the hint
        if hint_title and (not parsed.get("title") or len(parsed["title"]) < 3):
            parsed["title"] = hint_title
        if hint_company and (not parsed.get("company") or len(parsed["company"]) < 2):
            parsed["company"] = hint_company

        return parsed
    except Exception as e:
        logger.error("LLM extraction failed", error=str(e))
        return {
            "title": hint_title,
            "company": hint_company,
            "requirements": [],
            "responsibilities": [],
            "required_skills": [],
            "preferred_skills": [],
            "qualifications": [],
            "tech_stack": [],
            "keywords": [],
        }


# ─── URL Validator ───────────────────────────────────────────────────────────

# Known job board / ATS domains — endswith() check covers all subdomains
_JOB_DOMAINS = {
    # Major job boards
    "linkedin.com", "indeed.com", "glassdoor.com", "monster.com",
    "dice.com", "ziprecruiter.com", "wellfound.com", "angel.co",
    "ycombinator.com", "naukri.com", "internshala.com", "unstop.com",
    "careerbuilder.com", "simplyhired.com", "jobstreet.com",
    "seek.com.au", "totaljobs.com", "reed.co.uk", "cv-library.co.uk",
    # ATS platforms (used across all industries)
    "greenhouse.io", "lever.co", "ashbyhq.com", "workable.com",
    "smartrecruiters.com", "jobvite.com", "breezy.hr", "bamboohr.com",
    "recruitee.com", "dover.com", "rippling.com", "workday.com",
    "myworkdayjobs.com", "icims.com", "taleo.net", "successfactors.com",
    "successfactors.eu", "sap-successfactors.com",
    "jobs.lever.co", "grnh.se",
    "teamtailor.com", "jazzhr.com", "jobscore.com", "comeet.co",
    "pinpointrecruitment.com", "clearcompany.com", "applytojob.com",
    "ultipro.com", "kronos.com", "silkroad.com",
    "oraclecloud.com",       # Oracle HCM — used by banks, hospitals, retailers
    "kenexa.com",            # IBM Kenexa
    "shl.com",
    "careerplug.com",        # SMB / retail / hospitality
    "paylocity.com", "paycor.com",
    "recruitingbypaychex.com",
    # Big-tech career portals
    "careers.microsoft.com", "apply.careers.microsoft.com",
    "careers.google.com", "hire.withgoogle.com",
    "metacareers.com", "jobs.apple.com",
    "amazon.jobs", "jobs.netflix.com",
    "careers.salesforce.com", "salesforce.wd12.myworkdayjobs.com",
    "careers.adobe.com", "adobe.wd5.myworkdayjobs.com",
    "jobs.spotify.com",
    # Indian job portals
    "shine.com", "timesjobs.com", "freshersworld.com", "hirist.com",
    "iimjobs.com", "cutshort.io", "instahyre.com",
}

# Subdomains that always indicate a company careers site
_CAREERS_SUBDOMAINS = {
    "careers", "jobs", "job", "work", "apply", "hiring",
    "talent", "join", "opportunities", "recruitment", "vacancies",
    "careers2", "career", "joinus",
}

# Path fragments that strongly indicate a job posting URL
_JOB_PATH_KEYWORDS = {
    "/jobs/", "/job/", "/careers/", "/careers",
    "/opening/", "/openings/", "/positions/", "/position/",
    "/vacancy/", "/vacancies/", "/role/", "/roles/",
    "/apply/", "/job-detail/", "/job-posting/", "/joboffer/",
    "/requisition/", "/posting/", "/join-us/", "/work-with-us/",
    "/join/", "/opportunities/", "/opportunity/", "/working-here/",
}

# Query-string param names used by ATSs to identify a specific job
_JOB_ID_PARAMS = {
    "pid", "jobid", "job_id", "jobid", "jid",
    "requisitionid", "req_id", "reqid",
    "jobpostingid", "positionid", "position_id",
    "currentjobid", "selected_job", "job",
}


def is_job_url(url: str) -> bool:
    """
    Return True if the URL is likely a job posting page.

    Checks (in order):
      1. Known ATS / job-board domain
      2. Careers/jobs subdomain (careers.walmart.com, jobs.nhs.uk, etc.)
      3. Job-related path keyword
      4. Job-ID query parameter (covers custom ATSs and apply pages)
      5. Numeric job-ID at end of path (common across all industries)
    """
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower().lstrip("www.")
        path = parsed.path.lower()
        qs_keys = {k.lower() for k in parse_qs(parsed.query)}

        if any(host == d or host.endswith("." + d) for d in _JOB_DOMAINS):
            return True
        # careers.*, jobs.*, talent.*, apply.* subdomains on ANY company domain
        subdomain = host.split(".")[0] if "." in host else ""
        if subdomain in _CAREERS_SUBDOMAINS:
            return True
        if any(kw in path for kw in _JOB_PATH_KEYWORDS):
            return True
        if qs_keys & _JOB_ID_PARAMS:
            return True
        # Numeric slug at end of path — /en-us/details/200554359/ or /job/12345678
        if re.search(r"/\d{6,}/?$", path):
            return True
    except Exception:
        pass
    return False


# ─── Main Entry Point ────────────────────────────────────────────────────────

async def search_and_scrape_job(
    company_name: str = "",
    job_title: Optional[str] = None,
    job_id: Optional[str] = None,
    direct_url: Optional[str] = None,
) -> Optional[dict]:
    """
    Main entry point: find and scrape a job description.

    URL-only flow (preferred):
      1. LinkedIn guest API (no auth, fastest)
      2. httpx lightweight  (Greenhouse, Lever, static pages)
      3. Playwright full JS (Indeed, Workday, dynamic pages)
      4. Synthetic fallback from metadata

    Returns {"raw_text", "parsed_data", "source_url"} or None.
    """
    logger.info(
        "Starting job search",
        company=company_name,
        title=job_title,
        direct_url=direct_url,
    )

    # Normalize ATS-specific URLs (e.g. Microsoft apply page → job description page)
    if direct_url:
        direct_url = normalize_job_url(direct_url)

    # Reject non-job URLs immediately to prevent fake JD generation
    if direct_url and not is_job_url(direct_url):
        logger.warning("URL does not appear to be a job posting — skipping", url=direct_url)
        return None

    raw_text: Optional[str] = None
    source_url: Optional[str] = None
    metadata: dict = {"title": "", "company": ""}

    # ── Strategy 0: Direct URL ──────────────────────────────────────────────
    # Race strategies in parallel — first non-empty result wins.
    # Previously sequential (20s + 20s + 35s = 75s worst case).
    # Now: all fire at once, total cap = 10s.
    if direct_url:
        url = direct_url

        async def _try_linkedin():
            if "linkedin.com" in url:
                return await scrape_linkedin_guest_api(url)
            return None

        async def _try_httpx():
            html = await scrape_url_with_httpx(url)
            if html and len(html) > 800:
                meta = extract_metadata_from_html(html, url)
                content = extract_job_content_from_html(html, url)
                if content and len(content) > 200:
                    return content, meta
            return None

        async def _try_jina():
            return await scrape_url_with_jina(url)

        async def _try_firecrawl():
            return await scrape_url_with_firecrawl(url)

        async def _try_playwright():
            html = await scrape_url_with_playwright(url, timeout=20)
            if html:
                meta = extract_metadata_from_html(html, url)
                content = extract_job_content_from_html(html, url)
                if content and len(content) > 200:
                    return content, meta
            return None

        # Stage 1: fast no-JS scrapers in parallel (LinkedIn API, httpx, Jina, Firecrawl)
        # Playwright is heavy — only run it if the fast stage misses.
        try:
            fast_results = await asyncio.wait_for(
                asyncio.gather(
                    _try_linkedin(),
                    _try_httpx(),
                    _try_jina(),
                    _try_firecrawl(),
                    return_exceptions=True,
                ),
                timeout=25.0,
            )
        except asyncio.TimeoutError:
            fast_results = [None, None, None, None]

        for res in fast_results:
            if res and not isinstance(res, Exception) and isinstance(res, tuple):
                raw_text, metadata = res
                if raw_text:
                    source_url = url
                    logger.info("Scrape success (fast stage)", chars=len(raw_text))
                    break

        # Stage 2: Playwright with networkidle — handles any JS SPA universally
        if not raw_text:
            logger.info("Fast stage missed — launching Playwright (networkidle)", url=url)
            try:
                res = await _try_playwright()
                if res and isinstance(res, tuple):
                    raw_text, metadata = res
                    if raw_text:
                        source_url = url
                        logger.info("Scrape success (Playwright)", chars=len(raw_text))
            except Exception:
                pass

        if not raw_text:
            logger.warning("All URL strategies failed", url=url)

    # ── Strategy 1: Job-ID based company career URLs (legacy path) ──────────
    if not raw_text and job_id and company_name:
        slug = company_name.lower().replace(" ", "").replace(".", "")
        career_urls = [
            f"https://boards.greenhouse.io/{slug}/jobs/{job_id}",
            f"https://jobs.lever.co/{slug}/{job_id}",
            f"https://careers.{slug}.com/jobs/{job_id}",
            f"https://www.{slug}.com/careers/{job_id}",
        ]
        # Race all career URLs simultaneously instead of sequential fallback
        async def _try_career_url(u: str):
            html = await scrape_url_with_httpx(u)
            if html and len(html) > 800:
                meta = extract_metadata_from_html(html, u)
                content = extract_job_content_from_html(html, u)
                if content and len(content) > 200:
                    return u, content, meta
            return None

        try:
            career_results = await asyncio.wait_for(
                asyncio.gather(*[_try_career_url(u) for u in career_urls], return_exceptions=True),
                timeout=8.0,
            )
        except asyncio.TimeoutError:
            career_results = []

        for res in career_results:
            if res and not isinstance(res, Exception):
                source_url, raw_text, metadata = res
                break

    # ── Determine effective title + company for LLM ─────────────────────────
    # Prefer metadata extracted from the page; fall back to request params.
    eff_title = metadata.get("title") or job_title or ""
    eff_company = metadata.get("company") or company_name or ""

    # ── Parse with LLM if we have real job content ──────────────────────────
    # Discard pages that look like login walls even if they passed earlier checks
    if raw_text and _is_blocked_page(raw_text):
        logger.warning("Extracted text looks like a login/block page — discarding")
        raw_text = None

    # Require at least one job-related keyword in the text
    if raw_text:
        lower_sample = raw_text.lower()[:3000]
        job_signal_count = sum(1 for s in _JOB_SIGNALS if s in lower_sample)
        if job_signal_count == 0:
            logger.warning("No job signals in extracted text — discarding", url=direct_url)
            raw_text = None

    if raw_text and len(raw_text) >= 150:
        parsed = await extract_job_details_with_llm(
            raw_text=raw_text,
            hint_title=eff_title,
            hint_company=eff_company,
            url=direct_url or source_url or "",
        )
        return {
            "raw_text": raw_text[:15000],
            "parsed_data": parsed,
            "source_url": source_url,
        }

    # No real job content could be extracted — do not fabricate a JD
    logger.warning(
        "Could not extract real job content from URL — aborting",
        url=direct_url,
        title=eff_title,
    )
    return None


async def generate_synthetic_job(company: str, job_title: str, url: str = "") -> dict:
    """
    Fallback: generate a realistic job description via LLM when scraping fails.
    Uses the actual job title from metadata — never defaults to 'Software Engineer'.
    """
    from app.services.groq_limiter import groq_call

    url_hint = f"(from URL: {url})" if url else ""
    prompt = (
        f"Write a realistic job description for \"{job_title}\" at {company or 'a top tech company'} {url_hint}.\n"
        "Include role-appropriate skills (e.g. for a PM role: roadmapping, stakeholder management, PRDs; "
        "for a data role: SQL, Python, modelling; etc.).\n"
        "Return JSON only — required_skills (6–8), preferred_skills (3–4), responsibilities (5–7), tech_stack (4–6):\n"
        f'{{"title":"{job_title}","company":"{company}","location":"Remote","job_type":"Full-time",'
        '"experience_level":"Mid","requirements":[],"responsibilities":[],"required_skills":[],'
        '"preferred_skills":[],"qualifications":[],"tech_stack":[],"keywords":[],"about_company":""}}'
    )

    try:
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1000,
            json_mode=True,
            use_cache=True,
            cache_ttl=86400,
        )
        parsed = json.loads(raw)
        # Ensure title/company are correct even if LLM drifted
        parsed["title"] = parsed.get("title") or job_title
        parsed["company"] = parsed.get("company") or company
        raw_text = _parsed_to_text(parsed)
        return {"raw_text": raw_text, "parsed_data": parsed, "source_url": None}
    except Exception as e:
        logger.error("Synthetic job generation failed", error=str(e))
        return {
            "raw_text": f"{job_title} at {company}",
            "parsed_data": {
                "title": job_title,
                "company": company,
                "requirements": [],
                "responsibilities": [],
                "required_skills": [],
                "preferred_skills": [],
                "qualifications": [],
                "tech_stack": [],
                "keywords": [],
            },
            "source_url": None,
        }


def _parsed_to_text(parsed: dict) -> str:
    parts = [
        f"Job Title: {parsed.get('title', '')}",
        f"Company: {parsed.get('company', '')}",
        f"Requirements: {'. '.join(parsed.get('requirements', []))}",
        f"Responsibilities: {'. '.join(parsed.get('responsibilities', []))}",
        f"Required Skills: {', '.join(parsed.get('required_skills', []))}",
        f"Preferred Skills: {', '.join(parsed.get('preferred_skills', []))}",
        f"Tech Stack: {', '.join(parsed.get('tech_stack', []))}",
    ]
    return "\n".join(p for p in parts if p.split(": ", 1)[1])
