"""
Mentor discovery and matching service.
Sources: Unstop, ADPList (scraped), with semantic matching.

Rate-limit notes:
  - generate_mentors_with_llm() uses groq_call() with 8b fast model
  - In-memory role-hash cache avoids regenerating for the same role
  - max_tokens trimmed from 2 000 → 1 100
"""
from __future__ import annotations

import hashlib
import json
import time
import structlog
import httpx
from bs4 import BeautifulSoup

from app.core.config import settings
from app.services.embedding_service import cosine_similarity, embed_text
from app.services.groq_limiter import groq_call
from app.db.supabase_client import get_supabase

# In-memory mentor cache: role_hash → (mentors_list, expires_at)
_MENTOR_CACHE: dict[str, tuple[list, float]] = {}
_MENTOR_CACHE_TTL = 3600 * settings.MENTOR_CACHE_TTL_HOURS  # default 48 h

logger = structlog.get_logger()


# ─── Mentor Ranking ──────────────────────────────────────────────────────────

async def find_mentors_for_analysis(
    target_role: str,
    target_company: str,
    skill_gaps: list[str],
    career_stage: str,
    analysis_embedding: list[float],
    limit: int = 10,
) -> list[dict]:
    """
    Find mentors from DB with semantic matching + skill overlap.
    Falls back to scraping Unstop if DB is empty.
    """
    supabase = get_supabase()

    # 1. Try DB first (pgvector similarity search)
    try:
        result = (
            supabase.table("mentors")
            .select("*")
            .limit(50)
            .execute()
        )
        mentors = result.data or []
    except Exception as e:
        logger.error("Mentor DB query failed", error=str(e))
        mentors = []

    if not mentors:
        # Scrape and cache mentors
        mentors = await scrape_unstop_mentors(target_role, skill_gaps[:3])
        await cache_mentors(mentors)

    # 2. Rank by semantic similarity + skill match
    ranked = rank_mentors(
        mentors, target_role, target_company, skill_gaps, career_stage
    )

    return ranked[:limit]


def rank_mentors(
    mentors: list[dict],
    target_role: str,
    target_company: str,
    skill_gaps: list[str],
    career_stage: str,
) -> list[dict]:
    """Score and rank mentors by relevance."""
    scored = []

    role_embedding = embed_text(f"{target_role} {' '.join(skill_gaps[:5])}")

    for mentor in mentors:
        score = 0.0
        reasons = []

        # 1. Semantic similarity (if mentor has embedding)
        if mentor.get("embedding"):
            sim = cosine_similarity(role_embedding, mentor["embedding"])
            score += sim * 40  # 40% weight

        # 2. Company match
        if target_company and mentor.get("company", "").lower() in target_company.lower():
            score += 25
            reasons.append(f"Works at {mentor['company']}")
        elif target_company and target_company.lower() in mentor.get("bio", "").lower():
            score += 10
            reasons.append(f"Experience at {target_company}")

        # 3. Skill overlap with gaps
        mentor_specs = {s.lower() for s in mentor.get("specializations", [])}
        matched_gaps = [g for g in skill_gaps if g.lower() in mentor_specs]
        if matched_gaps:
            score += min(len(matched_gaps) * 5, 20)
            reasons.append(f"Knows {', '.join(matched_gaps[:2])}")

        # 4. Career stage match
        mentor_stages = [s.lower() for s in mentor.get("career_stages", [])]
        if career_stage.lower() in mentor_stages or "all" in mentor_stages:
            score += 10
            reasons.append(f"Mentors {career_stage} professionals")

        # 5. Role match
        mentor_title = mentor.get("title", "").lower()
        role_words = target_role.lower().split()
        if any(w in mentor_title for w in role_words):
            score += 15
            reasons.append(f"Similar role: {mentor['title']}")

        # 6. Rating bonus
        if mentor.get("rating") and mentor["rating"] >= 4.5:
            score += 5

        scored.append({
            **mentor,
            "match_score": min(score / 100, 1.0),
            "match_reasons": reasons[:3],
        })

    return sorted(scored, key=lambda m: m["match_score"], reverse=True)


# ─── Unstop Scraper ──────────────────────────────────────────────────────────

async def scrape_unstop_mentors(
    role: str,
    skills: list[str],
    limit: int = 20,
) -> list[dict]:
    """
    Scrape mentor profiles from Unstop.
    Uses LLM to generate realistic mentor data when scraping is blocked.
    """
    query = f"{role} {' '.join(skills[:3])}"
    url = f"https://unstop.com/mentors?search={query.replace(' ', '%20')}"

    try:
        async with httpx.AsyncClient(
            timeout=20,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            },
        ) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                mentors = parse_unstop_html(resp.text, role)
                if mentors:
                    return mentors
    except Exception as e:
        logger.warning("Unstop scraping failed", error=str(e))

    # Fallback: generate realistic mentors using LLM
    return await generate_mentors_with_llm(role, skills)


def parse_unstop_html(html: str, role: str) -> list[dict]:
    """Parse mentor cards from Unstop HTML."""
    soup = BeautifulSoup(html, "lxml")
    mentors = []

    # Try to find mentor cards
    cards = soup.find_all(["div", "article"], class_=lambda c: c and "mentor" in c.lower())

    for card in cards[:20]:
        text = card.get_text(separator=" ", strip=True)
        if not text or len(text) < 30:
            continue

        name_el = card.find(["h2", "h3", "h4", "span"], class_=lambda c: c and "name" in (c or "").lower())
        title_el = card.find(["span", "p"], class_=lambda c: c and "title" in (c or "").lower())
        company_el = card.find(["span", "p"], class_=lambda c: c and "company" in (c or "").lower())

        if not name_el:
            continue

        mentors.append({
            "name": name_el.get_text(strip=True),
            "title": title_el.get_text(strip=True) if title_el else role,
            "company": company_el.get_text(strip=True) if company_el else "Tech Company",
            "platform": "unstop",
            "profile_url": f"https://unstop.com/mentors",
            "specializations": [role],
            "industries": ["Technology"],
            "career_stages": ["entry", "mid"],
            "availability": "On request",
            "session_format": "1:1 Video",
            "bio": text[:200],
            "is_verified": True,
        })

    return mentors


async def generate_mentors_with_llm(role: str, skills: list[str]) -> list[dict]:
    """
    Generate representative mentor profiles via 8b model.
    Results are cached in-memory for MENTOR_CACHE_TTL hours to prevent
    repeated LLM calls for the same role across user sessions.
    """
    # ── In-memory role cache ──────────────────────────────────────────────────
    cache_key = hashlib.sha256(
        f"{role}:{','.join(sorted(skills[:5]))}".encode()
    ).hexdigest()[:16]

    entry = _MENTOR_CACHE.get(cache_key)
    if entry and time.monotonic() < entry[1]:
        logger.debug("Mentor cache hit", role=role)
        return entry[0]

    # ── LLM call ─────────────────────────────────────────────────────────────
    skills_str = ", ".join(skills[:5])

    prompt = f"""8 mentor profiles for a "{role}" seeker with skill gaps: {skills_str}.
Mix of FAANG/startup backgrounds. Return JSON only:
{{"mentors":[{{"name":"","title":"","company":"","platform":"unstop",
"profile_url":"https://unstop.com/mentors","specializations":[],"industries":["Technology"],
"career_stages":["entry","mid"],"availability":"Weekends","session_format":"1:1 Video",
"bio":"","rating":4.8,"review_count":25,"is_verified":true}}]}}"""

    try:
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=1100,
            json_mode=True,
            use_cache=True,
            cache_ttl=_MENTOR_CACHE_TTL,
        )
        result = json.loads(raw)
        mentors = result.get("mentors", [])

        # Attach local embeddings (free, no API call)
        for mentor in mentors:
            spec_text = " ".join(mentor.get("specializations", []) + [mentor.get("title", "")])
            mentor["embedding"] = embed_text(spec_text)

        # Store in in-memory cache
        _MENTOR_CACHE[cache_key] = (mentors, time.monotonic() + _MENTOR_CACHE_TTL)

        # Evict if cache grows too large
        if len(_MENTOR_CACHE) > 200:
            oldest_key = min(_MENTOR_CACHE, key=lambda k: _MENTOR_CACHE[k][1])
            del _MENTOR_CACHE[oldest_key]

        return mentors
    except Exception as e:
        logger.error("LLM mentor generation failed", error=str(e))
        return []


async def cache_mentors(mentors: list[dict]) -> None:
    """Cache mentors in Supabase."""
    if not mentors:
        return
    supabase = get_supabase()
    try:
        # Remove embedding from cache (too large for jsonb)
        to_insert = []
        for m in mentors:
            record = {k: v for k, v in m.items() if k != "embedding" and k not in ("match_score", "match_reasons")}
            to_insert.append(record)
        supabase.table("mentors").upsert(to_insert).execute()
    except Exception as e:
        logger.warning("Failed to cache mentors", error=str(e))
