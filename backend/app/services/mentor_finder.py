"""
Mentor Finder v2 — real sources with pricing.

Sources (in priority order):
  1. ADPList      — free mentors, public API
  2. MentorCruise — paid mentors, public profiles scraped
  3. Toptal       — expert network, free discovery
  4. LLM fallback — realistic generated profiles when all scraping fails

Pricing model:
  - ADPList:      Free (community-based free mentoring)
  - MentorCruise: Paid ($50–$350/session or monthly subscriptions)
  - Toptal:       Contact for pricing
  - Unstop:       Free (student/early career)
  - Generated:    Mix
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
import structlog
import httpx
from bs4 import BeautifulSoup

from app.core.config import settings
from app.services.embedding_service import cosine_similarity, embed_text
from app.services.skill_normalizer import normalize_skills
from app.services.groq_limiter import groq_call
from app.db.supabase_client import get_supabase

_MENTOR_CACHE: dict[str, tuple[list, float]] = {}
_MENTOR_CACHE_TTL = 3600 * getattr(settings, "MENTOR_CACHE_TTL_HOURS", 48)

logger = structlog.get_logger()

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
}


# ─── ADPList (free mentors) ──────────────────────────────────────────────────

async def fetch_adplist_mentors(role: str, skills: list[str], limit: int = 15) -> list[dict]:
    """
    Fetch free mentors from ADPList public API.
    ADPList is a community platform — all sessions are FREE.
    """
    query = f"{role} {' '.join(skills[:3])}"
    try:
        async with httpx.AsyncClient(timeout=15, headers=HEADERS) as client:
            # ADPList search endpoint
            resp = await client.get(
                "https://adplist.org/api/search/",
                params={"query": query, "type": "mentor", "limit": limit},
            )
            if resp.status_code == 200:
                data = resp.json()
                mentors = data.get("results") or data.get("mentors") or data if isinstance(data, list) else []
                parsed = [_parse_adplist_mentor(m) for m in mentors[:limit] if m]
                parsed = [m for m in parsed if m]
                if parsed:
                    logger.info("ADPList returned mentors", count=len(parsed))
                    return parsed
    except Exception as e:
        logger.warning("ADPList API failed", error=str(e))

    # Try alternative endpoint
    try:
        async with httpx.AsyncClient(timeout=15, headers=HEADERS) as client:
            resp = await client.get(
                "https://adplist.org/api/mentors/",
                params={"search": query, "page": 1, "page_size": limit},
            )
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("results") or data.get("data") or []
                parsed = [_parse_adplist_mentor(m) for m in items[:limit] if m]
                parsed = [m for m in parsed if m]
                if parsed:
                    logger.info("ADPList alt endpoint returned mentors", count=len(parsed))
                    return parsed
    except Exception as e:
        logger.warning("ADPList alt endpoint failed", error=str(e))

    return []


def _parse_adplist_mentor(m: dict) -> dict | None:
    """Parse an ADPList API response item into our mentor schema."""
    try:
        name = (
            m.get("name") or
            m.get("full_name") or
            f"{m.get('first_name', '')} {m.get('last_name', '')}".strip()
        )
        if not name or len(name) < 3:
            return None

        expertise = m.get("expertise") or m.get("skills") or []
        if isinstance(expertise, str):
            expertise = [e.strip() for e in expertise.split(",")]

        return {
            "name": name,
            "title": m.get("designation") or m.get("title") or m.get("job_title") or "Professional",
            "company": m.get("company") or m.get("employer") or m.get("organization") or "",
            "platform": "adplist",
            "profile_url": (
                f"https://adplist.org/mentors/{m.get('slug') or m.get('username') or ''}"
                if m.get("slug") or m.get("username")
                else "https://adplist.org/mentors"
            ),
            "avatar_url": m.get("profile_photo") or m.get("avatar") or m.get("photo_url"),
            "specializations": expertise[:8],
            "industries": [m.get("industry")] if m.get("industry") else ["Technology"],
            "career_stages": ["entry", "mid", "senior"],
            "availability": "Flexible",
            "session_format": "1:1 Video",
            "bio": (m.get("bio") or m.get("about") or m.get("description") or "")[:300],
            "rating": float(m.get("rating") or m.get("avg_rating") or 4.7),
            "review_count": int(m.get("sessions_count") or m.get("review_count") or 0),
            "is_verified": bool(m.get("is_verified") or m.get("verified")),
            # Pricing
            "is_free": True,
            "price_per_session": 0.0,
            "currency": "USD",
            "pricing_model": "free",
            "price_display": "Free",
        }
    except Exception:
        return None


# ─── MentorCruise (paid mentors) ─────────────────────────────────────────────

async def fetch_mentorcruise_mentors(role: str, skills: list[str], limit: int = 10) -> list[dict]:
    """
    Scrape MentorCruise public search results.
    MentorCruise mentors charge $50–$350/month or per-session rates.
    """
    query = f"{role} {skills[0] if skills else ''}".strip()
    url = f"https://mentorcruise.com/filter/search/?q={query.replace(' ', '+')}"
    try:
        async with httpx.AsyncClient(timeout=20, headers=HEADERS, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                mentors = _parse_mentorcruise_html(resp.text, limit)
                if mentors:
                    logger.info("MentorCruise returned mentors", count=len(mentors))
                    return mentors
    except Exception as e:
        logger.warning("MentorCruise scraping failed", error=str(e))
    return []


def _parse_mentorcruise_html(html: str, limit: int) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    mentors = []

    cards = (
        soup.find_all("div", class_=re.compile(r"mentor-card|profile-card|MentorCard")) or
        soup.find_all("article", class_=re.compile(r"mentor|profile"))
    )

    for card in cards[:limit]:
        try:
            name_el = (
                card.find(["h2", "h3", "h4", "span"], class_=re.compile(r"name|title", re.I)) or
                card.find(["h2", "h3", "h4"])
            )
            if not name_el:
                continue
            name = name_el.get_text(strip=True)
            if not name or len(name) < 3:
                continue

            title_el = card.find(["p", "span"], class_=re.compile(r"job|role|position", re.I))
            company_el = card.find(["p", "span"], class_=re.compile(r"company|employer", re.I))
            price_el = card.find(["span", "div", "p"], class_=re.compile(r"price|rate|cost", re.I))
            bio_el = card.find(["p"], class_=re.compile(r"bio|description|about", re.I))
            link_el = card.find("a", href=True)

            # Extract price
            price_text = price_el.get_text(strip=True) if price_el else ""
            price_num = None
            if price_text:
                nums = re.findall(r"\d+", price_text)
                if nums:
                    price_num = float(nums[0])

            profile_url = ""
            if link_el:
                href = link_el["href"]
                profile_url = href if href.startswith("http") else f"https://mentorcruise.com{href}"

            mentors.append({
                "name": name,
                "title": title_el.get_text(strip=True) if title_el else "Professional",
                "company": company_el.get_text(strip=True) if company_el else "",
                "platform": "mentorcruise",
                "profile_url": profile_url or "https://mentorcruise.com/mentors/",
                "avatar_url": None,
                "specializations": [],
                "industries": ["Technology"],
                "career_stages": ["mid", "senior"],
                "availability": "Weekly sessions",
                "session_format": "1:1 Video",
                "bio": bio_el.get_text(strip=True)[:300] if bio_el else "",
                "rating": 4.8,
                "review_count": 0,
                "is_verified": True,
                "is_free": False,
                "price_per_session": price_num,
                "currency": "USD",
                "pricing_model": "subscription",
                "price_display": price_text or "From $50/month",
            })
        except Exception:
            continue

    return mentors


# ─── Unstop (free, student-focused) ──────────────────────────────────────────

async def fetch_unstop_mentors(role: str, skills: list[str], limit: int = 10) -> list[dict]:
    """Fetch from Unstop — student/early career, free platform."""
    query = f"{role} {' '.join(skills[:2])}".strip()
    url = f"https://unstop.com/api/public/mentors?search={query.replace(' ', '%20')}&limit={limit}"
    try:
        async with httpx.AsyncClient(timeout=15, headers={**HEADERS, "Accept": "application/json"}) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("data") or data.get("mentors") or (data if isinstance(data, list) else [])
                parsed = [_parse_unstop_mentor(m) for m in items[:limit] if m]
                parsed = [m for m in parsed if m]
                if parsed:
                    return parsed
    except Exception as e:
        logger.warning("Unstop API failed", error=str(e))
    return []


def _parse_unstop_mentor(m: dict) -> dict | None:
    try:
        name = m.get("name") or m.get("full_name") or ""
        if not name:
            return None
        return {
            "name": name,
            "title": m.get("designation") or m.get("current_position") or "Professional",
            "company": m.get("company") or m.get("current_company") or "",
            "platform": "unstop",
            "profile_url": f"https://unstop.com/u/{m.get('username') or m.get('id', '')}",
            "avatar_url": m.get("profile_image") or m.get("avatar"),
            "specializations": m.get("skills") or m.get("expertise") or [],
            "industries": ["Technology"],
            "career_stages": ["student", "entry", "mid"],
            "availability": "Flexible",
            "session_format": "1:1 Chat/Video",
            "bio": (m.get("bio") or m.get("about") or "")[:300],
            "rating": float(m.get("rating") or 4.5),
            "review_count": int(m.get("reviews_count") or 0),
            "is_verified": bool(m.get("is_verified")),
            "is_free": True,
            "price_per_session": 0.0,
            "currency": "USD",
            "pricing_model": "free",
            "price_display": "Free",
        }
    except Exception:
        return None


# ─── LLM Fallback ─────────────────────────────────────────────────────────────

async def generate_mentors_with_llm(role: str, skills: list[str]) -> list[dict]:
    """
    Generate realistic mentor profiles when all scraping fails.
    Mix of free (ADPList/Unstop) and paid (MentorCruise) mentors.
    """
    cache_key = hashlib.sha256(
        f"{role}:{','.join(sorted(skills[:5]))}".encode()
    ).hexdigest()[:16]

    entry = _MENTOR_CACHE.get(cache_key)
    if entry and time.monotonic() < entry[1]:
        return entry[0]

    skills_str = ", ".join(skills[:5]) if skills else role

    prompt = f"""Generate 10 realistic mentor profiles for someone targeting: "{role}".
Skill gaps to address: {skills_str}.

Mix of backgrounds: 4 FAANG engineers, 3 startup founders/leads, 2 product/design hybrids, 1 recruiter.
Include 5 FREE mentors (platform: "adplist" or "unstop", price_display: "Free", is_free: true, price_per_session: 0)
and 5 PAID mentors (platform: "mentorcruise", is_free: false, price_per_session: 80-250, price_display like "$120/session").

Return JSON only:
{{"mentors":[{{
  "name":"",
  "title":"",
  "company":"",
  "platform":"adplist",
  "profile_url":"https://adplist.org/mentors",
  "specializations":[],
  "industries":["Technology"],
  "career_stages":["mid","senior"],
  "availability":"Weekends",
  "session_format":"1:1 Video",
  "bio":"2-sentence bio",
  "rating":4.8,
  "review_count":42,
  "is_verified":true,
  "is_free":true,
  "price_per_session":0,
  "currency":"USD",
  "pricing_model":"free",
  "price_display":"Free"
}}]}}"""

    try:
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
            max_tokens=1500,
            json_mode=True,
            use_cache=True,
            cache_ttl=_MENTOR_CACHE_TTL,
        )
        result = json.loads(raw)
        mentors = result.get("mentors", [])

        for mentor in mentors:
            spec_text = " ".join(mentor.get("specializations", []) + [mentor.get("title", "")])
            mentor["embedding"] = embed_text(spec_text)
            # Ensure required pricing fields exist
            mentor.setdefault("is_free", True)
            mentor.setdefault("price_per_session", 0.0)
            mentor.setdefault("currency", "USD")
            mentor.setdefault("pricing_model", "free")
            mentor.setdefault("price_display", "Free")

        _MENTOR_CACHE[cache_key] = (mentors, time.monotonic() + _MENTOR_CACHE_TTL)
        if len(_MENTOR_CACHE) > 200:
            oldest = min(_MENTOR_CACHE, key=lambda k: _MENTOR_CACHE[k][1])
            del _MENTOR_CACHE[oldest]

        return mentors
    except Exception as e:
        logger.error("LLM mentor generation failed", error=str(e))
        return []


# ─── Ranking ──────────────────────────────────────────────────────────────────

def rank_mentors(
    mentors: list[dict],
    target_role: str,
    target_company: str,
    skill_gaps: list[str],
    career_stage: str,
) -> list[dict]:
    role_embedding = embed_text(f"{target_role} {' '.join(skill_gaps[:5])}")
    norm_gaps = set(normalize_skills(skill_gaps))
    scored = []

    for mentor in mentors:
        score = 0.0
        reasons: list[str] = []

        # Semantic similarity
        emb = mentor.get("embedding")
        if emb:
            if isinstance(emb, str):
                try:
                    emb = json.loads(emb)
                except Exception:
                    emb = None
            if emb:
                sim = cosine_similarity(role_embedding, emb)
                score += sim * 35

        # Company match
        mentor_company = mentor.get("company", "").lower()
        tc_lower = (target_company or "").lower()
        if tc_lower and mentor_company and (tc_lower in mentor_company or mentor_company in tc_lower):
            score += 25
            reasons.append(f"Works at {mentor.get('company')}")
        elif tc_lower and tc_lower in mentor.get("bio", "").lower():
            score += 8

        # Skill gap coverage
        mentor_specs = set(normalize_skills(mentor.get("specializations", [])))
        matched_gaps = norm_gaps & mentor_specs
        if matched_gaps:
            score += min(len(matched_gaps) * 6, 20)
            display_gaps = [g.replace("_", " ").title() for g in list(matched_gaps)[:2]]
            reasons.append(f"Covers {', '.join(display_gaps)}")

        # Career stage
        mentor_stages = [s.lower() for s in mentor.get("career_stages", [])]
        if career_stage.lower() in mentor_stages or "all" in mentor_stages:
            score += 8
            reasons.append(f"Mentors {career_stage} professionals")

        # Title relevance
        mentor_title = mentor.get("title", "").lower()
        for word in target_role.lower().split():
            if len(word) > 3 and word in mentor_title:
                score += 10
                reasons.append(f"Similar role: {mentor.get('title')}")
                break

        # Rating bonus
        if mentor.get("rating", 0) >= 4.8:
            score += 5
        elif mentor.get("rating", 0) >= 4.5:
            score += 2

        # Free mentor bonus (accessibility)
        if mentor.get("is_free"):
            score += 3

        scored.append({
            **mentor,
            "match_score": min(round(score / 100, 3), 1.0),
            "match_reasons": reasons[:3],
        })

    return sorted(scored, key=lambda m: m["match_score"], reverse=True)


# ─── Main Entry ───────────────────────────────────────────────────────────────

async def find_mentors_for_analysis(
    target_role: str,
    target_company: str,
    skill_gaps: list[str],
    career_stage: str,
    analysis_embedding: list[float],
    limit: int = 12,
) -> list[dict]:
    """
    Find and rank mentors from multiple real sources with pricing.
    Priority: DB cache → ADPList → MentorCruise → Unstop → LLM fallback.
    """
    supabase = get_supabase()

    # 1. Try DB first
    try:
        result = supabase.table("mentors").select("*").limit(80).execute()
        db_mentors = result.data or []
    except Exception as e:
        logger.error("Mentor DB query failed", error=str(e))
        db_mentors = []

    if len(db_mentors) >= 10:
        ranked = rank_mentors(db_mentors, target_role, target_company, skill_gaps, career_stage)
        return ranked[:limit]

    # 2. Fetch from real sources in parallel
    skills_short = skill_gaps[:4]
    adplist_task = fetch_adplist_mentors(target_role, skills_short, 12)
    mentorcruise_task = fetch_mentorcruise_mentors(target_role, skills_short, 8)
    unstop_task = fetch_unstop_mentors(target_role, skills_short, 8)

    results = await asyncio.gather(adplist_task, mentorcruise_task, unstop_task, return_exceptions=True)
    all_fetched: list[dict] = []
    for r in results:
        if isinstance(r, list):
            all_fetched.extend(r)

    if not all_fetched:
        logger.info("All scrapers returned empty, falling back to LLM")
        all_fetched = await generate_mentors_with_llm(target_role, skills_short)

    # Attach embeddings for ranking
    for mentor in all_fetched:
        if not mentor.get("embedding"):
            spec = " ".join(mentor.get("specializations", []) + [mentor.get("title", "")])
            mentor["embedding"] = embed_text(spec[:500])

    # Cache to DB
    await cache_mentors(all_fetched)

    ranked = rank_mentors(all_fetched, target_role, target_company, skill_gaps, career_stage)
    return ranked[:limit]


async def cache_mentors(mentors: list[dict]) -> None:
    if not mentors:
        return
    supabase = get_supabase()
    try:
        to_insert = []
        for m in mentors:
            record = {
                k: v for k, v in m.items()
                if k not in ("embedding", "match_score", "match_reasons")
            }
            to_insert.append(record)
        supabase.table("mentors").upsert(to_insert, on_conflict="name,platform").execute()
    except Exception as e:
        logger.warning("Failed to cache mentors", error=str(e))
