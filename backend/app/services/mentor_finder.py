"""
Mentor Finder — real platform search cards only.

Every card links to a real, publicly accessible search-results page on
a live mentorship platform, pre-filtered for the user's target role.
No individual profile URLs are ever generated (they break when slugs are
wrong or profiles are removed). No LLM-generated fake profiles. No DB cache.

Platforms returned:
  Free  — ADPList, Unstop, Topmate (free tier), LinkedIn
  Paid  — MentorCruise, Topmate (paid bookings)
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
        case "adplist":
            return f"https://adplist.org/mentors?search={r}"
        case "unstop":
            return f"https://unstop.com/mentors?search={r}"
        case "mentorcruise":
            return f"https://mentorcruise.com/filter/search/?q={r}"
        case "topmate":
            return f"https://topmate.io/explore/category/tech"
        case "linkedin":
            return (
                f"https://www.linkedin.com/search/results/people/"
                f"?keywords={q}+mentor&network=%5B%22F%22%2C%22S%22%5D"
            )
        case _:
            return f"https://adplist.org/mentors?search={r}"


# ─── Platform metadata ────────────────────────────────────────────────────────

_PLATFORMS = {
    "adplist": {
        "label": "ADPList",
        "is_free": True,
        "price_display": "Free",
        "pricing_model": "free",
        "bio": (
            "The world's largest free mentorship community. 1:1 sessions with "
            "professionals at FAANG, startups, and top companies — no cost, ever. "
            "Hundreds of mentors in every tech and business role."
        ),
        "session_format": "1:1 Video / Chat",
    },
    "unstop": {
        "label": "Unstop",
        "is_free": True,
        "price_display": "Free",
        "pricing_model": "free",
        "bio": (
            "India's top platform for students and early-career professionals. "
            "Free access to mentors from IITs, IIMs, and top MNCs across tech, "
            "finance, and consulting. Great for campus placements and first jobs."
        ),
        "session_format": "1:1 Chat / Video",
    },
    "topmate": {
        "label": "Topmate",
        "is_free": False,
        "price_display": "Free & Paid",
        "pricing_model": "per_session",
        "bio": (
            "India's fastest-growing expert community. Book 1:1 sessions, resume "
            "reviews, and mock interviews with engineers and PMs at Google, "
            "Microsoft, Flipkart, and more. Many mentors offer a free intro call."
        ),
        "session_format": "1:1 Video · Resume Review · Mock Interview",
    },
    "mentorcruise": {
        "label": "MentorCruise",
        "is_free": False,
        "price_display": "From $30/session",
        "pricing_model": "per_session",
        "bio": (
            "Premium mentorship marketplace with structured monthly plans. "
            "Vetted mentors from top global companies — great for long-term "
            "career coaching, interview prep, and portfolio reviews."
        ),
        "session_format": "Monthly subscription · Per session",
    },
    "linkedin": {
        "label": "LinkedIn",
        "is_free": True,
        "price_display": "Free",
        "pricing_model": "free",
        "bio": (
            "Search LinkedIn for professionals in your target role and reach out "
            "directly. Many senior folks are happy to do a coffee chat. Use the "
            "'Open to mentoring' filter or just send a personalised connection request."
        ),
        "session_format": "Coffee chat · Informational interview",
    },
}


# ─── Card builder ─────────────────────────────────────────────────────────────

def _platform_card(platform: str, role: str, skills: list[str]) -> dict:
    meta = _PLATFORMS.get(platform, _PLATFORMS["adplist"])
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
        "currency": "USD",
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
    Every link goes to a real, publicly accessible search-results page.
    Order: free platforms first, then paid.
    """
    role = (target_role or "Software Engineer").strip()
    skills = skill_gaps[:5]

    # Order: free first, paid last
    platform_order = ["adplist", "unstop", "topmate", "mentorcruise", "linkedin"]

    # India-specific: Topmate and Unstop bumped up
    if country in ("India", "IN"):
        platform_order = ["topmate", "adplist", "unstop", "mentorcruise", "linkedin"]

    cards = [_platform_card(p, role, skills) for p in platform_order]
    logger.info("Mentor platform cards generated", role=role, count=len(cards))
    return cards


# ─── Kept for route compatibility ─────────────────────────────────────────────

def rank_mentors(mentors, target_role, target_company, skill_gaps, career_stage):
    """Pass-through — cards are already ordered by relevance."""
    return mentors
