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

    # 4. h1 page heading as last resort (Lever / Ashby / Workday)
    if not title:
        for h1 in soup.find_all("h1"):
            text = h1.get_text(strip=True)
            if 5 < len(text) < 120:
                title = text
                break

    logger.debug("Metadata fallback result", title=title, company=company)
    return {"title": title, "company": company}


# ─── LinkedIn Guest API ──────────────────────────────────────────────────────

def _linkedin_job_id(url: str) -> Optional[str]:
    """Extract job ID from a LinkedIn jobs URL."""
    # /jobs/view/1234567890/ or ?currentJobId=1234567890
    m = re.search(r"/jobs/view/(\d+)", url)
    if m:
        return m.group(1)
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    for key in ("currentJobId", "jobId"):
        if key in qs:
            return qs[key][0]
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

async def scrape_url_with_httpx(url: str) -> Optional[str]:
    """Lightweight HTTP scrape for non-JS pages (Greenhouse, Lever, static career pages)."""
    try:
        async with httpx.AsyncClient(
            timeout=20,
            follow_redirects=True,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
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
    Full Playwright scrape for JavaScript-heavy pages (Indeed, Workday, company career portals).
    Waits for content to appear, clicks "Show more" expansions.
    """
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
            )
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1440, "height": 900},
                locale="en-US",
            )
            page = await context.new_page()

            # Block heavy resources
            await page.route(
                "**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,otf,mp4,mp3}",
                lambda r: r.abort(),
            )

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=timeout * 1000)

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

# Platform-specific selector lists (ordered by specificity)
_SELECTORS: dict[str, list[str]] = {
    "linkedin.com": [
        "div.jobs-description__content",
        "div.jobs-box__html-content",
        "section.description__text",
        "div.show-more-less-html__markup",
        "div[class*='jobs-description']",
        "div.description__text",
    ],
    "indeed.com": [
        "div#jobDescriptionText",
        "div.jobsearch-jobDescriptionText",
        "div[data-testid='jobsearch-jobDescriptionText']",
        "div.job_seen_beacon",
    ],
    "greenhouse.io": [
        "div#content",
        "div.job-post-description",
        "div.job__description",
        "div[class*='job-description']",
    ],
    "lever.co": [
        "div.section-wrapper",
        "div.content",
        "div[class*='posting-description']",
    ],
    "myworkdayjobs.com": [
        "div[data-automation-id='jobPostingDescription']",
        "div[class*='job-description']",
    ],
    "smartrecruiters.com": [
        "div.job-description",
        "section[class*='description']",
    ],
    "ashbyhq.com": [
        "div[class*='ashby-job-posting']",
        "div.prose",
        "div[class*='description']",
    ],
    "naukri.com": [
        "div.job-desc",
        "div[class*='job-description']",
        "section.job-desc",
    ],
    "unstop.com": [
        "div.opportunity-details",
        "div[class*='description']",
    ],
}

_GENERIC_SELECTORS = [
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
    Extract the job description text from HTML.
    Uses platform-specific selectors first, then generic fallback.
    Returns cleaned text or None.
    """
    soup = BeautifulSoup(html, "lxml")

    # Remove noise elements
    for tag in soup.find_all([
        "script", "style", "nav", "header", "footer", "iframe",
        "noscript", "aside", "form", "svg",
    ]):
        tag.decompose()

    # Pick selector list for this platform
    domain = urlparse(url).netloc.lower()
    selectors: list[str] = []
    for platform, sels in _SELECTORS.items():
        if platform in domain:
            selectors = sels + _GENERIC_SELECTORS
            break
    if not selectors:
        selectors = _GENERIC_SELECTORS

    for selector in selectors:
        try:
            el = soup.select_one(selector)
        except Exception:
            continue
        if el:
            text = el.get_text(separator="\n", strip=True)
            # Require substantial content
            if len(text) > 300:
                return _clean_text(text)

    # Fallback: find the single div with the most text
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
            f"The job listing is for the role \"{hint_title}\" "
            f"at company \"{hint_company}\". "
            "Use these as the primary title/company values — do not invent a different role.\n\n"
        )

    # Pass up to 6000 chars — enough to capture full JD including requirements section
    prompt = (
        f"{hint_block}"
        f"Extract structured job info from this listing.\n"
        f"URL: {url}\n\n"
        f"Text:\n{raw_text[:6000]}\n\n"
        "Return JSON only — be precise about the job title (e.g. 'Product Manager', "
        "'Software Engineer', 'Data Scientist') and required_skills vs tech_stack:\n"
        '{"title":"","company":"","location":"","job_type":"Full-time","experience_level":"Mid",'
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

    raw_text: Optional[str] = None
    source_url: Optional[str] = None
    metadata: dict = {"title": "", "company": ""}

    # ── Strategy 0: Direct URL ──────────────────────────────────────────────
    if direct_url:
        url = direct_url

        # 0a. LinkedIn guest API (no login required)
        if "linkedin.com" in url:
            result = await scrape_linkedin_guest_api(url)
            if result:
                raw_text, metadata = result
                source_url = url

        # 0b. httpx (Greenhouse, Lever, and other mostly-static pages)
        if not raw_text:
            html = await scrape_url_with_httpx(url)
            if html and len(html) > 800:
                metadata = extract_metadata_from_html(html, url)
                content = extract_job_content_from_html(html, url)
                if content and len(content) > 200:
                    raw_text = content
                    source_url = url
                    logger.info("httpx scrape success", chars=len(raw_text))

        # 0c. Playwright (Indeed, Workday, anything JS-heavy)
        if not raw_text:
            html = await scrape_url_with_playwright(url, timeout=settings.SCRAPING_TIMEOUT)
            if html:
                metadata = extract_metadata_from_html(html, url)
                content = extract_job_content_from_html(html, url)
                if content and len(content) > 200:
                    raw_text = content
                    source_url = url
                    logger.info("Playwright scrape success", chars=len(raw_text))

        if not raw_text:
            logger.warning("All URL strategies failed — using synthetic fallback", url=url)

    # ── Strategy 1: Job-ID based company career URLs (legacy path) ──────────
    if not raw_text and job_id and company_name:
        slug = company_name.lower().replace(" ", "").replace(".", "")
        career_urls = [
            f"https://boards.greenhouse.io/{slug}/jobs/{job_id}",
            f"https://jobs.lever.co/{slug}/{job_id}",
            f"https://careers.{slug}.com/jobs/{job_id}",
            f"https://www.{slug}.com/careers/{job_id}",
        ]
        for url in career_urls:
            html = await scrape_url_with_httpx(url)
            if not html:
                html = await scrape_url_with_playwright(url)
            if html and len(html) > 800:
                metadata = extract_metadata_from_html(html, url)
                content = extract_job_content_from_html(html, url)
                if content and len(content) > 200:
                    raw_text = content
                    source_url = url
                    break

    # ── Determine effective title + company for LLM ─────────────────────────
    # Prefer metadata extracted from the page; fall back to request params.
    eff_title = metadata.get("title") or job_title or ""
    eff_company = metadata.get("company") or company_name or ""

    # ── Parse with LLM if we have text ──────────────────────────────────────
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

    # ── Last resort: synthetic JD from metadata ──────────────────────────────
    # Uses the page title as the role anchor so we never default to "Software Engineer"
    fallback_title = eff_title or job_title
    if not fallback_title:
        logger.warning("No title detected from URL — cannot generate synthetic JD")
        return None

    return await generate_synthetic_job(eff_company, fallback_title, direct_url or "")


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
