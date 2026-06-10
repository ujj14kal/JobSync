"""
Mentor Finder — real platform search cards, India-first.

Every card links to a real, publicly accessible search-results page on
a live mentorship platform, pre-filtered for the user's target role.
No individual profile URLs are ever generated (they break when slugs are
wrong or profiles are removed). No LLM-generated fake profiles. No DB cache.

Platforms (India-first order):
  Free  — Unstop, ADPList, Preplaced (free intro), LinkedIn
  Paid  — Topmate, iDreamCareer, Mentro
"""
from __future__ import annotations

from urllib.parse import quote_plus

import structlog

logger = structlog.get_logger()


# ─── Search URL builder ───────────────────────────────────────────────────────

def _search_url(platform: str, role: str, skills: list[str] = []) -> str:
    r = quote_plus(role.strip() or "software engineer")
    q = quote_plus(f"{role} {' '.join(skills[:2])}".strip())
    match platform:
        case "unstop":
            return f"https://unstop.com/mentors?search={r}"
        case "adplist":
            return f"https://adplist.org/mentors?search={r}"
        case "topmate":
            return f"https://topmate.io/explore/category/tech?q={r}"
        case "preplaced":
            return f"https://preplaced.in/mentors?search={r}"
        case "idreamcareer":
            return f"https://idreamcareer.com/mentor/?search={r}"
        case "mentro":
            return f"https://mentro.co/mentors?search={r}"
        case "linkedin":
            return (
                f"https://www.linkedin.com/search/results/people/"
                f"?keywords={q}+mentor+india&network=%5B%22F%22%2C%22S%22%5D"
            )
        case _:
            return f"https://unstop.com/mentors?search={r}"


# ─── Platform metadata ────────────────────────────────────────────────────────

_PLATFORMS = {
    "unstop": {
        "label": "Unstop",
        "is_free": True,
        "price_display": "Free",
        "pricing_model": "free",
        "bio": (
            "India's #1 platform for students and early-career professionals. "
            "Free 1:1 sessions with mentors from IITs, IIMs, BITS, and top MNCs — "
            "Infosys, TCS, Amazon India, Zomato, and more. Best for campus placements, "
            "first jobs, and internships."
        ),
        "session_format": "1:1 Chat · Video · Group sessions",
    },
    "topmate": {
        "label": "Topmate",
        "is_free": False,
        "price_display": "Free intro · ₹200–₹2000/session",
        "pricing_model": "per_session",
        "bio": (
            "India's largest paid mentorship marketplace. Book resume reviews, "
            "mock interviews, and 1:1 guidance with engineers and PMs at Google India, "
            "Microsoft, Flipkart, Swiggy, CRED, and top startups. "
            "Most mentors offer a free 15-min intro call."
        ),
        "session_format": "1:1 Video · Resume Review · Mock Interview",
    },
    "preplaced": {
        "label": "Preplaced",
        "is_free": False,
        "price_display": "Free intro · ₹500–₹3000/session",
        "pricing_model": "per_session",
        "bio": (
            "Structured mentorship from senior professionals at top Indian and "
            "global tech companies. Strong focus on placement prep, system design, "
            "and DSA coaching. Used by thousands of IIT/NIT graduates cracking "
            "FAANG and top product companies."
        ),
        "session_format": "1:1 Video · Placement prep · System design",
    },
    "adplist": {
        "label": "ADPList",
        "is_free": True,
        "price_display": "Free",
        "pricing_model": "free",
        "bio": (
            "World's largest free mentorship community — 50,000+ mentors globally "
            "including many Indian professionals at FAANG, Atlassian, Salesforce. "
            "No cost ever. Great for global roles and international exposure."
        ),
        "session_format": "1:1 Video / Chat",
    },
    "idreamcareer": {
        "label": "iDreamCareer",
        "is_free": False,
        "price_display": "₹499–₹2000/session",
        "pricing_model": "per_session",
        "bio": (
            "India-focused career counselling and mentorship platform. Specialists "
            "in streams like engineering, MBA, UPSC, and government jobs. Best for "
            "students deciding between career paths or preparing for competitive exams."
        ),
        "session_format": "1:1 Video · Career counselling",
    },
    "mentro": {
        "label": "Mentro",
        "is_free": False,
        "price_display": "Free & Paid",
        "pricing_model": "per_session",
        "bio": (
            "Growing Indian platform connecting students with working professionals "
            "across tech, finance, and product roles. Good for tier-2 city students "
            "and those looking for affordable mentorship from Indian industry experts."
        ),
        "session_format": "1:1 Video · Career guidance",
    },
    "linkedin": {
        "label": "LinkedIn",
        "is_free": True,
        "price_display": "Free",
        "pricing_model": "free",
        "bio": (
            "Search LinkedIn for Indian professionals in your target role and reach "
            "out with a personalised note. Many senior folks based in Bangalore, "
            "Hyderabad, Pune, and Mumbai are happy to do a 30-min call. "
            "Filter by location 'India' and send a tailored connection request."
        ),
        "session_format": "Coffee chat · Informational interview",
    },
}


# ─── Card builder ─────────────────────────────────────────────────────────────

def _platform_card(platform: str, role: str, skills: list[str]) -> dict:
    meta = _PLATFORMS.get(platform, _PLATFORMS["unstop"])
    url = _search_url(platform, role, skills)
    role_display = role.strip() or "your target role"
    return {
        "id": f"platform-card-{platform}",
        "name": f"{meta['label']} — {role_display} mentors",
        "title": f"Find {role_display} mentors",
        "company": meta["label"],
        "platform": platform,
        "profile_url": url,
        "search_url": url,
        "is_platform_card": True,
        "is_generated": False,
        "avatar_url": None,
        "specializations": [s.title() for s in skills[:5]] if skills else [],
        "industries": ["Technology"],
        "career_stages": ["all"],
        "availability": "Varies by mentor",
        "session_format": meta["session_format"],
        "bio": meta["bio"],
        "rating": None,
        "review_count": None,
        "is_verified": True,
        "is_free": meta["is_free"],
        "price_per_session": 0.0 if meta["is_free"] else None,
        "currency": "INR",
        "pricing_model": meta["pricing_model"],
        "price_display": meta["price_display"],
        "match_score": 0.0,
        "match_reasons": [],
    }


# ─── Main entry point ─────────────────────────────────────────────────────────

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
    Return mentor platform search cards for the given role and skill gaps.
    India-first order: Unstop → Topmate → Preplaced → ADPList → iDreamCareer → Mentro → LinkedIn
    """
    role = (target_role or "Software Engineer").strip()
    skills = skill_gaps[:5]

    # India-first: Unstop + Topmate lead, all Indian platforms included
    platform_order = ["unstop", "topmate", "preplaced", "adplist", "idreamcareer", "mentro", "linkedin"]

    cards = [_platform_card(p, role, skills) for p in platform_order]
    logger.info("Mentor platform cards generated", role=role, count=len(cards))
    return cards


# ─── Kept for route compatibility ─────────────────────────────────────────────

def rank_mentors(mentors, target_role, target_company, skill_gaps, career_stage):
    """Pass-through — cards are already ordered by relevance."""
    return mentors
