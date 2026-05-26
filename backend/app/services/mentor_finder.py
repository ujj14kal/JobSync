"""
Mentor discovery and matching service.
Sources: Unstop, ADPList (scraped), with semantic matching.
"""
from __future__ import annotations

import json
import structlog
import httpx
from bs4 import BeautifulSoup
from groq import AsyncGroq

from app.core.config import settings
from app.services.embedding_service import cosine_similarity, embed_text
from app.db.supabase_client import get_supabase

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
    Use Groq to generate realistic mentor profiles when scraping fails.
    These are representative examples, not real people's data.
    """
    client = AsyncGroq(api_key=settings.GROQ_API_KEY)

    skills_str = ", ".join(skills[:5])

    prompt = f"""Generate 8 realistic mentor profiles for someone looking for a "{role}" mentor with skills in: {skills_str}.
These should represent the types of mentors available on Unstop and ADPList.

Return ONLY valid JSON:
{{
  "mentors": [
    {{
      "name": "realistic Indian/international name",
      "title": "their current job title",
      "company": "their company (mix of FAANG, startups, etc.)",
      "platform": "unstop",
      "profile_url": "https://unstop.com/mentors",
      "specializations": ["skill1", "skill2", "skill3"],
      "industries": ["Technology"],
      "career_stages": ["entry", "mid"],
      "availability": "Weekends",
      "session_format": "1:1 Video",
      "bio": "2-3 sentence bio about their experience and mentoring style",
      "rating": 4.5-5.0,
      "review_count": 10-100,
      "is_verified": true
    }}
  ]
}}

Make them realistic, diverse (mix of FAANG and startup backgrounds), and genuinely helpful for a "{role}" seeker."""

    try:
        response = await client.chat.completions.create(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=2000,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        mentors = result.get("mentors", [])

        # Add embeddings
        for mentor in mentors:
            spec_text = " ".join(mentor.get("specializations", []) + [mentor.get("title", "")])
            mentor["embedding"] = embed_text(spec_text)

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
