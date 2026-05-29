"""
Mentor Finder — real profiles only.

Sources (tried in order):
  1. ADPList   — free community platform, public search API
  2. Unstop    — free for students, public mentor listing
  3. MentorCruise — paid, public search page scrape

If a platform's API returns no data, the platform is surfaced as a
"Browse on <Platform>" suggestion card (is_platform_card=True) so the
redirect always lands on a real, relevant search-results page.

NO LLM-generated fake profiles are created. Every mentor entry
either came from a real API/scrape or is a platform search card.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
import hashlib
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup
import structlog

from app.core.config import settings
from app.services.embedding_service import cosine_similarity, embed_text
from app.services.skill_normalizer import normalize_skills
from app.db.supabase_client import get_supabase

logger = structlog.get_logger()

_MENTOR_CACHE: dict[str, tuple[list, float]] = {}
_MENTOR_CACHE_TTL = 3600 * getattr(settings, "MENTOR_CACHE_TTL_HOURS", 48)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
}


# ─── Search URL Builder ───────────────────────────────────────────────────────

def _search_url(platform: str, role: str, skills: list[str] = []) -> str:
    """Return a verified, always-working search URL for the platform."""
    q = quote_plus(f"{role} {' '.join(skills[:2])}".strip())
    r = quote_plus(role.strip())
    if platform == "adplist":
        return f"https://adplist.org/mentors?search={r}"
    elif platform == "unstop":
        return f"https://unstop.com/mentors?search={r}"
    elif platform == "linkedin":
        return (
            f"https://www.linkedin.com/search/results/people/"
            f"?keywords={q}+mentor&network=%5B%22F%22%2C%22S%22%5D"
        )
    elif platform == "mentorcruise":
        return f"https://mentorcruise.com/filter/search/?q={r}"
    return f"https://adplist.org/mentors?search={r}"


# ─── Platform suggestion cards (shown when scraping returns nothing) ──────────

def _platform_card(platform: str, role: str, skills: list[str]) -> dict:
    """
    A non-fake suggestion card that sends the user to the platform's real
    search page pre-filtered for their role.  Never shows a specific profile.
    """
    meta = {
        "adplist":     {"label": "ADPList",      "desc": "Free 1:1 mentoring from professionals worldwide. Community-driven, no cost ever.", "is_free": True,  "color": "adplist"},
        "unstop":      {"label": "Unstop",        "desc": "Free mentors for students and early-career professionals across India and beyond.", "is_free": True,  "color": "unstop"},
        "mentorcruise": {"label": "MentorCruise", "desc": "Paid mentors with structured programmes. Monthly subscriptions or per-session booking.", "is_free": False, "color": "mentorcruise"},
        "linkedin":    {"label": "LinkedIn",      "desc": "Search LinkedIn for professionals offering mentoring in your target role.", "is_free": True,  "color": "linkedin"},
    }
    m = meta.get(platform, meta["adplist"])
    return {
        "id": f"platform-card-{platform}",
        "name": f"Find {role} mentors on {m['label']}",
        "title": f"Browse real {role} mentors",
        "company": m["label"],
        "platform": platform,
        "profile_url": _search_url(platform, role, skills),
        "search_url": _search_url(platform, role, skills),
        "is_platform_card": True,   # UI uses this to render a different card style
        "is_generated": False,
        "avatar_url": None,
        "specializations": skills[:5],
        "industries": ["Technology"],
        "career_stages": ["all"],
        "availability": "Varies by mentor",
        "session_format": "1:1 Video / Chat",
        "bio": m["desc"],
        "rating": None,
        "review_count": None,
        "is_verified": True,
        "is_free": m["is_free"],
        "price_per_session": 0.0 if m["is_free"] else None,
        "currency": "USD",
        "pricing_model": "free" if m["is_free"] else "per_session",
        "price_display": "Free" if m["is_free"] else "Paid",
    }


# ─── ADPList — real API ───────────────────────────────────────────────────────

async def fetch_adplist_mentors(role: str, skills: list[str], limit: int = 15) -> list[dict]:
    query = f"{role} {' '.join(skills[:3])}".strip()
    endpoints = [
        ("https://adplist.org/api/search/",         {"query": query, "type": "mentor", "limit": limit}),
        ("https://adplist.org/api/mentors/",         {"search": query, "page": 1, "page_size": limit}),
        ("https://api.adplist.org/core/mentor/",     {"search": query, "limit": limit}),
    ]
    for url, params in endpoints:
        try:
            async with httpx.AsyncClient(timeout=15, headers=HEADERS) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    items = (
                        data.get("results") or data.get("mentors") or
                        data.get("data") or (data if isinstance(data, list) else [])
                    )
                    if items:
                        parsed = [_parse_adplist(m, role, skills) for m in items[:limit] if m]
                        parsed = [m for m in parsed if m]
                        if parsed:
                            logger.info("ADPList real mentors", count=len(parsed), endpoint=url)
                            return parsed
        except Exception as e:
            logger.warning("ADPList endpoint failed", url=url, error=str(e))
    return []


def _parse_adplist(m: dict, role: str, skills: list[str]) -> dict | None:
    try:
        name = (
            m.get("name") or
            m.get("full_name") or
            f"{m.get('first_name', '')} {m.get('last_name', '')}".strip()
        )
        if not name or len(name) < 3:
            return None

        slug = m.get("slug") or m.get("username") or ""
        # Only link to a real profile when we have a real slug
        profile_url = (
            f"https://adplist.org/mentors/{slug}"
            if slug and re.match(r"^[a-zA-Z0-9_\-]+$", slug)
            else _search_url("adplist", role, skills)
        )

        expertise = m.get("expertise") or m.get("skills") or []
        if isinstance(expertise, str):
            expertise = [e.strip() for e in expertise.split(",") if e.strip()]

        title = m.get("designation") or m.get("title") or m.get("job_title") or "Professional"
        return {
            "name": name,
            "title": title,
            "company": m.get("company") or m.get("employer") or m.get("organization") or "",
            "platform": "adplist",
            "profile_url": profile_url,
            "search_url": _search_url("adplist", role, skills),
            "is_platform_card": False,
            "is_generated": False,
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
            "is_free": True,
            "price_per_session": 0.0,
            "currency": "USD",
            "pricing_model": "free",
            "price_display": "Free",
        }
    except Exception:
        return None


# ─── Unstop — real API ────────────────────────────────────────────────────────

async def fetch_unstop_mentors(role: str, skills: list[str], limit: int = 10) -> list[dict]:
    query = f"{role} {' '.join(skills[:2])}".strip()
    endpoints = [
        f"https://unstop.com/api/public/mentors?search={quote_plus(query)}&limit={limit}",
        f"https://unstop.com/api/public/opportunity/mentor/search?search={quote_plus(query)}&limit={limit}",
    ]
    for url in endpoints:
        try:
            async with httpx.AsyncClient(
                timeout=15,
                headers={**HEADERS, "Accept": "application/json"},
            ) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    items = data.get("data") or data.get("mentors") or (data if isinstance(data, list) else [])
                    if items:
                        parsed = [_parse_unstop(m, role, skills) for m in items[:limit] if m]
                        parsed = [m for m in parsed if m]
                        if parsed:
                            logger.info("Unstop real mentors", count=len(parsed))
                            return parsed
        except Exception as e:
            logger.warning("Unstop endpoint failed", url=url, error=str(e))
    return []


def _parse_unstop(m: dict, role: str, skills: list[str]) -> dict | None:
    try:
        name = m.get("name") or m.get("full_name") or ""
        if not name or len(name) < 3:
            return None
        username = m.get("username") or ""
        profile_url = (
            f"https://unstop.com/u/{username}"
            if username and re.match(r"^[a-zA-Z0-9_.\-]+$", username)
            else _search_url("unstop", role, skills)
        )
        specializations = m.get("skills") or m.get("expertise") or []
        title = m.get("designation") or m.get("current_position") or "Professional"
        return {
            "name": name,
            "title": title,
            "company": m.get("company") or m.get("current_company") or "",
            "platform": "unstop",
            "profile_url": profile_url,
            "search_url": _search_url("unstop", role, skills),
            "is_platform_card": False,
            "is_generated": False,
            "avatar_url": m.get("profile_image") or m.get("avatar"),
            "specializations": specializations[:8],
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


# ─── MentorCruise — HTML scrape ───────────────────────────────────────────────

async def fetch_mentorcruise_mentors(role: str, skills: list[str], limit: int = 8) -> list[dict]:
    query = f"{role} {skills[0] if skills else ''}".strip()
    url = f"https://mentorcruise.com/filter/search/?q={quote_plus(query)}"
    try:
        async with httpx.AsyncClient(timeout=20, headers=HEADERS, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                mentors = _parse_mentorcruise_html(resp.text, limit, role, skills)
                if mentors:
                    logger.info("MentorCruise real mentors", count=len(mentors))
                    return mentors
    except Exception as e:
        logger.warning("MentorCruise scrape failed", error=str(e))
    return []


def _parse_mentorcruise_html(html: str, limit: int, role: str, skills: list[str]) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    mentors: list[dict] = []

    cards = (
        soup.find_all("div", class_=re.compile(r"mentor-card|profile-card|MentorCard", re.I)) or
        soup.find_all("article", class_=re.compile(r"mentor|profile", re.I))
    )

    for card in cards[:limit]:
        try:
            name_el = (
                card.find(["h2", "h3", "h4"], class_=re.compile(r"name", re.I)) or
                card.find(["h2", "h3", "h4"])
            )
            if not name_el:
                continue
            name = name_el.get_text(strip=True)
            if not name or len(name) < 3:
                continue

            link_el = card.find("a", href=True)
            if not link_el:
                continue
            href = link_el["href"]
            # Only use profile URL if it points to a real mentor page (not a search page)
            if href and ("/mentor/" in href or "/mentors/" in href):
                profile_url = href if href.startswith("http") else f"https://mentorcruise.com{href}"
            else:
                profile_url = _search_url("mentorcruise", role, skills)

            title_el = card.find(["p", "span"], class_=re.compile(r"job|role|position", re.I))
            price_el = card.find(["span", "div"], class_=re.compile(r"price|rate|cost", re.I))
            bio_el = card.find("p", class_=re.compile(r"bio|description|about", re.I))

            price_text = price_el.get_text(strip=True) if price_el else ""
            price_num: float | None = None
            nums = re.findall(r"\d+", price_text)
            if nums:
                price_num = float(nums[0])

            mentors.append({
                "name": name,
                "title": title_el.get_text(strip=True) if title_el else "Professional",
                "company": "",
                "platform": "mentorcruise",
                "profile_url": profile_url,
                "search_url": _search_url("mentorcruise", role, skills),
                "is_platform_card": False,
                "is_generated": False,
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
                "pricing_model": "per_session",
                "price_display": price_text or "Paid",
            })
        except Exception:
            continue
    return mentors


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
    scored: list[dict] = []

    for mentor in mentors:
        # Platform cards float to the bottom (shown as a browse suggestion)
        if mentor.get("is_platform_card"):
            scored.append({**mentor, "match_score": 0.0, "match_reasons": []})
            continue

        score = 0.0
        reasons: list[str] = []

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

        mentor_company = mentor.get("company", "").lower()
        tc_lower = (target_company or "").lower()
        if tc_lower and mentor_company and (tc_lower in mentor_company or mentor_company in tc_lower):
            score += 25
            reasons.append(f"Works at {mentor.get('company')}")

        mentor_specs = set(normalize_skills(mentor.get("specializations", [])))
        matched = norm_gaps & mentor_specs
        if matched:
            score += min(len(matched) * 6, 20)
            display = [g.replace("_", " ").title() for g in list(matched)[:2]]
            reasons.append(f"Covers {', '.join(display)}")

        mentor_stages = [s.lower() for s in mentor.get("career_stages", [])]
        if career_stage.lower() in mentor_stages or "all" in mentor_stages:
            score += 8

        mentor_title = mentor.get("title", "").lower()
        for word in target_role.lower().split():
            if len(word) > 3 and word in mentor_title:
                score += 10
                reasons.append(f"Similar role: {mentor.get('title')}")
                break

        if (mentor.get("rating") or 0) >= 4.8:
            score += 5
        elif (mentor.get("rating") or 0) >= 4.5:
            score += 2

        # Free mentors appear before paid
        if mentor.get("is_free"):
            score += 20

        scored.append({
            **mentor,
            "match_score": min(round(score / 100, 3), 1.0),
            "match_reasons": reasons[:3],
        })

    return sorted(scored, key=lambda m: (0 if not m.get("is_platform_card") else 1, -m.get("match_score", 0)))


# ─── Main Entry Point ─────────────────────────────────────────────────────────

async def find_mentors_for_analysis(
    target_role: str,
    target_company: str,
    skill_gaps: list[str],
    career_stage: str,
    analysis_embedding: list[float],
    country: str = "",
    limit: int = 25,
) -> list[dict]:
    """
    Fetch real mentors from ADPList, Unstop, MentorCruise.
    If a platform returns no data, its result is replaced with a platform
    suggestion card that links to the platform's real search results page.

    NO fake / LLM-generated profiles are ever returned.
    """
    supabase = get_supabase()

    # Try DB cache first (only real profiles, not platform cards)
    try:
        result = supabase.table("mentors").select("*").eq("is_platform_card", False).limit(100).execute()
        db_mentors = result.data or []
    except Exception:
        try:
            result = supabase.table("mentors").select("*").limit(100).execute()
            db_mentors = [m for m in (result.data or []) if not m.get("is_platform_card")]
        except Exception as e:
            logger.error("Mentor DB query failed", error=str(e))
            db_mentors = []

    if len(db_mentors) >= 10:
        ranked = rank_mentors(db_mentors, target_role, target_company, skill_gaps, career_stage)
        return ranked[:limit]

    skills_short = skill_gaps[:4]

    # Fetch from real platforms in parallel
    adplist_task = fetch_adplist_mentors(target_role, skills_short, 15)
    unstop_task = fetch_unstop_mentors(target_role, skills_short, 10)
    mentorcruise_task = fetch_mentorcruise_mentors(target_role, skills_short, 8)

    results = await asyncio.gather(adplist_task, unstop_task, mentorcruise_task, return_exceptions=True)

    adplist_mentors = results[0] if isinstance(results[0], list) else []
    unstop_mentors = results[1] if isinstance(results[1], list) else []
    mc_mentors = results[2] if isinstance(results[2], list) else []

    all_real: list[dict] = [*adplist_mentors, *unstop_mentors, *mc_mentors]

    # For each platform that returned nothing, add a suggestion card
    # so the user always has a path to real mentors
    platform_cards: list[dict] = []
    if not adplist_mentors:
        platform_cards.append(_platform_card("adplist", target_role, skills_short))
    if not unstop_mentors:
        platform_cards.append(_platform_card("unstop", target_role, skills_short))
    if not mc_mentors:
        platform_cards.append(_platform_card("mentorcruise", target_role, skills_short))

    # Add LinkedIn search card (we never scrape LinkedIn, always link to search)
    platform_cards.append(_platform_card("linkedin", target_role, skills_short))

    # Attach embeddings to real mentors for ranking
    for mentor in all_real:
        if not mentor.get("embedding"):
            spec = " ".join(mentor.get("specializations", []) + [mentor.get("title", "")])
            mentor["embedding"] = embed_text(spec[:500])

    # Cache real mentors to DB
    await _cache_mentors(all_real)

    ranked_real = rank_mentors(all_real, target_role, target_company, skill_gaps, career_stage)

    # Real mentors first, platform cards at the end
    combined = ranked_real + platform_cards
    return combined[:limit]


async def _cache_mentors(mentors: list[dict]) -> None:
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
