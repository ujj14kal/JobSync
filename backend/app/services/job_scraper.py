"""
Job description scraper using Playwright + BeautifulSoup.
Supports: LinkedIn Jobs, Indeed, company career pages.
Falls back to Groq LLM for content extraction.
"""
from __future__ import annotations

import asyncio
import re
import json
from typing import Optional
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup
import structlog

from app.core.config import settings

logger = structlog.get_logger()


# ─── Search URL Builders ─────────────────────────────────────────────────────

def build_linkedin_search_url(company: str, job_title: str) -> str:
    q = quote_plus(f"{job_title} {company}")
    return f"https://www.linkedin.com/jobs/search/?keywords={q}&f_C={quote_plus(company)}"


def build_indeed_search_url(company: str, job_title: str) -> str:
    return (
        f"https://www.indeed.com/jobs?q={quote_plus(job_title)}"
        f"&l=&fromage=14&sc=0kf%3Aattr(DSQF7)%3B&as_cmp={quote_plus(company)}"
    )


def build_company_careers_url(company: str, job_id: str) -> list[str]:
    """Try known careers page URL patterns."""
    slug = company.lower().replace(" ", "").replace(".", "")
    return [
        f"https://careers.{slug}.com/jobs/{job_id}",
        f"https://jobs.{slug}.com/{job_id}",
        f"https://www.{slug}.com/careers/{job_id}",
        f"https://boards.greenhouse.io/{slug}/jobs/{job_id}",
        f"https://jobs.lever.co/{slug}/{job_id}",
        f"https://www.workatastartup.com/companies/{slug}",
    ]


# ─── Playwright Scraper ──────────────────────────────────────────────────────

async def scrape_url_with_playwright(url: str, timeout: int = 30) -> Optional[str]:
    """
    Scrape a URL using Playwright (headless Chromium).
    Returns raw HTML or None on failure.
    """
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 800},
            )
            page = await context.new_page()

            # Block unnecessary resources to speed up
            await page.route(
                "**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,otf}",
                lambda r: r.abort(),
            )

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=timeout * 1000)
                await page.wait_for_timeout(2000)  # Let JS render

                # Try to expand "See more" buttons
                for selector in [
                    "button.show-more-less-html__button",
                    "[data-automation='job-description-toggle']",
                    "button:has-text('Show more')",
                    "button:has-text('See more')",
                ]:
                    try:
                        await page.click(selector, timeout=2000)
                        await page.wait_for_timeout(1000)
                    except Exception:
                        pass

                html = await page.content()
                return html
            except Exception as e:
                logger.warning("Page navigation failed", url=url, error=str(e))
                return None
            finally:
                await browser.close()

    except Exception as e:
        logger.error("Playwright failed", error=str(e))
        return None


async def scrape_url_with_httpx(url: str) -> Optional[str]:
    """Lightweight HTTP scrape for non-dynamic pages."""
    try:
        async with httpx.AsyncClient(
            timeout=20,
            follow_redirects=True,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36"
                ),
            },
        ) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp.text
    except Exception as e:
        logger.warning("httpx scrape failed", url=url, error=str(e))
    return None


# ─── Content Extractors ──────────────────────────────────────────────────────

def extract_job_content_from_html(html: str, url: str) -> Optional[str]:
    """
    Extract job description text from HTML using BeautifulSoup.
    Tries multiple selectors for different platforms.
    """
    soup = BeautifulSoup(html, "lxml")

    # Remove noise
    for tag in soup.find_all(["script", "style", "nav", "header", "footer", "iframe"]):
        tag.decompose()

    # Platform-specific selectors
    selectors = []

    if "linkedin.com" in url:
        selectors = [
            "div.show-more-less-html__markup",
            "section.description__text",
            "div.description__text",
        ]
    elif "indeed.com" in url:
        selectors = [
            "div#jobDescriptionText",
            "div.jobsearch-jobDescriptionText",
        ]
    elif "greenhouse.io" in url:
        selectors = ["div#content", "div.job-post-description"]
    elif "lever.co" in url:
        selectors = ["div.section-wrapper", "div.content"]
    else:
        # Generic: try common patterns
        selectors = [
            "div[class*='job-description']",
            "div[class*='description']",
            "div[id*='job-description']",
            "article",
            "main",
        ]

    for selector in selectors:
        el = soup.select_one(selector)
        if el:
            text = el.get_text(separator="\n", strip=True)
            if len(text) > 200:
                return text

    # Fallback: grab the largest text block
    divs = soup.find_all("div")
    best = max(divs, key=lambda d: len(d.get_text()), default=None)
    if best:
        text = best.get_text(separator="\n", strip=True)
        if len(text) > 200:
            return text[:8000]

    return None


# ─── LLM-based Job Extractor ─────────────────────────────────────────────────

async def extract_job_details_with_llm(raw_text: str, company: str, job_title: str) -> dict:
    """
    Use Groq 8b model to extract structured job data from raw text.
    Uses groq_call() for rate-limit management + prompt-hash caching (24 h).
    """
    from app.services.groq_limiter import groq_call

    # Trim input aggressively — 8b doesn't need the whole listing
    prompt = f"""Extract job info. Company: {company}. Title: {job_title}.

Text: {raw_text[:3000]}

JSON only:
{{"title":"","company":"","location":"","job_type":"Full-time","experience_level":"Mid",
"salary_range":null,"requirements":[],"responsibilities":[],"required_skills":[],
"preferred_skills":[],"qualifications":[],"tech_stack":[],"keywords":[],"about_company":""}}"""

    try:
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=900,
            json_mode=True,
            use_cache=True,
            cache_ttl=86400,  # 24 h — same job text → same extraction
        )
        return json.loads(raw)
    except Exception as e:
        logger.error("LLM extraction failed", error=str(e))
        return {
            "title": job_title,
            "company": company,
            "requirements": [],
            "responsibilities": [],
            "required_skills": [],
            "preferred_skills": [],
            "qualifications": [],
            "tech_stack": [],
            "keywords": [],
        }


# ─── Main Job Search ──────────────────────────────────────────────────────────

async def search_and_scrape_job(
    company_name: str,
    job_title: Optional[str] = None,
    job_id: Optional[str] = None,
    direct_url: Optional[str] = None,
) -> Optional[dict]:
    """
    Main entry point: find and scrape a job description.
    Returns structured job data or None.

    If ``direct_url`` is provided it is tried first (highest priority),
    which lets users paste a LinkedIn / Indeed / company careers URL
    and skip the search-by-title step entirely.
    """
    logger.info(
        "Starting job search",
        company=company_name,
        title=job_title,
        job_id=job_id,
        direct_url=direct_url,
    )

    html = None
    source_url = None

    # Strategy 0: Direct URL provided — scrape it straight away
    if direct_url:
        html = await scrape_url_with_httpx(direct_url)
        if not html or len(html) < 1000:
            html = await scrape_url_with_playwright(direct_url, timeout=settings.SCRAPING_TIMEOUT)
        if html and len(html) > 1000:
            source_url = direct_url
            logger.info("Scraped direct URL successfully", url=direct_url)
        else:
            logger.warning("Direct URL scrape yielded insufficient content", url=direct_url)

    # Strategy 1: Try company careers URL with job_id
    if job_id:
        for url in build_company_careers_url(company_name, job_id):
            html = await scrape_url_with_httpx(url)
            if not html:
                html = await scrape_url_with_playwright(url)
            if html and len(html) > 1000:
                source_url = url
                break

    # Strategy 2: Search LinkedIn
    if not html and job_title:
        search_url = build_linkedin_search_url(company_name, job_title)
        html = await scrape_url_with_playwright(search_url, timeout=settings.SCRAPING_TIMEOUT)
        if html:
            source_url = search_url

    # Strategy 3: Search Indeed
    if not html and job_title:
        indeed_url = build_indeed_search_url(company_name, job_title)
        html = await scrape_url_with_playwright(indeed_url, timeout=settings.SCRAPING_TIMEOUT)
        if html:
            source_url = indeed_url

    if not html:
        logger.warning("Could not scrape job listing", company=company_name)
        # Fallback: generate synthetic job description
        return await generate_synthetic_job(company_name, job_title or "Software Engineer")

    # Extract text content
    raw_text = extract_job_content_from_html(html, source_url or "")

    if not raw_text or len(raw_text) < 100:
        return await generate_synthetic_job(company_name, job_title or "Software Engineer")

    # Parse with LLM
    parsed = await extract_job_details_with_llm(raw_text, company_name, job_title or "")

    return {
        "raw_text": raw_text[:10000],
        "parsed_data": parsed,
        "source_url": source_url,
    }


async def generate_synthetic_job(company: str, job_title: str) -> dict:
    """
    Fallback: generate a realistic job description via 8b model.
    Result is cached 24 h — same company+role pair reuses the output.
    """
    from app.services.groq_limiter import groq_call

    prompt = f"""Realistic job description for "{job_title}" at {company}.
Return JSON only — include required_skills (6-8), preferred_skills (3-4), responsibilities (5-7), tech_stack (5-8):
{{"title":"{job_title}","company":"{company}","location":"Remote","job_type":"Full-time",
"experience_level":"Mid","requirements":[],"responsibilities":[],"required_skills":[],
"preferred_skills":[],"qualifications":[],"tech_stack":[],"keywords":[],"about_company":""}}"""

    try:
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=800,
            json_mode=True,
            use_cache=True,
            cache_ttl=86400,  # 24 h
        )
        parsed = json.loads(raw)
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
    """Convert parsed job data back to text for embedding."""
    parts = [
        f"Job Title: {parsed.get('title', '')}",
        f"Company: {parsed.get('company', '')}",
        f"Requirements: {'. '.join(parsed.get('requirements', []))}",
        f"Responsibilities: {'. '.join(parsed.get('responsibilities', []))}",
        f"Required Skills: {', '.join(parsed.get('required_skills', []))}",
        f"Preferred Skills: {', '.join(parsed.get('preferred_skills', []))}",
        f"Tech Stack: {', '.join(parsed.get('tech_stack', []))}",
    ]
    return "\n".join(parts)
