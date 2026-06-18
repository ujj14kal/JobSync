"""
Resume Completeness Checker — zero LLM cost.

Runs pure text analysis to flag missing sections/quality issues.
Called once during run_analysis and stored in analyses.resume_completeness.
"""
from __future__ import annotations

import re


# Strong action verbs that indicate well-written bullets
_ACTION_VERBS = {
    "led", "built", "developed", "designed", "implemented", "launched", "created",
    "architected", "managed", "optimized", "reduced", "increased", "improved",
    "delivered", "deployed", "automated", "scaled", "migrated", "refactored",
    "established", "drove", "spearheaded", "owned", "collaborated", "mentored",
    "researched", "analyzed", "engineered", "integrated", "shipped", "contributed",
}


def check_resume_completeness(resume_text: str, parsed_resume: dict | None = None) -> dict:
    """
    Analyze resume text for quality signals.

    Returns:
        {
            "score": int (0-100),
            "checks": [{ "id", "label", "passed": bool, "tip": str|None }]
        }
    """
    t = resume_text.lower()
    parsed = parsed_resume or {}
    contact = parsed.get("contact", {}) if isinstance(parsed, dict) else {}

    checks = []

    # 1. Contact info (email + phone)
    has_email = bool(re.search(r"[\w.+-]+@[\w-]+\.[a-z]{2,}", t))
    has_phone = bool(re.search(r"[\+\d][\d\s\-\(\)]{7,}", resume_text))
    checks.append({
        "id": "contact",
        "label": "Contact information",
        "passed": has_email and has_phone,
        "tip": None if (has_email and has_phone) else "Add a professional email address and phone number.",
    })

    # 2. LinkedIn
    has_linkedin = "linkedin.com" in t or "linkedin.com/in/" in t or bool(contact.get("linkedin"))
    checks.append({
        "id": "linkedin",
        "label": "LinkedIn profile",
        "passed": has_linkedin,
        "tip": None if has_linkedin else "Add your LinkedIn URL — recruiters check it 80% of the time.",
    })

    # 3. GitHub / portfolio
    has_github = (
        "github.com" in t
        or "gitlab.com" in t
        or "portfolio" in t
        or bool(contact.get("github"))
        or bool(contact.get("portfolio"))
    )
    checks.append({
        "id": "github",
        "label": "GitHub or portfolio",
        "passed": has_github,
        "tip": None if has_github else "Link your GitHub profile or portfolio — essential for tech roles.",
    })

    # 4. Professional summary
    has_summary = any(w in t for w in ["summary", "objective", "about me", "profile", "overview"])
    checks.append({
        "id": "summary",
        "label": "Professional summary",
        "passed": has_summary,
        "tip": None if has_summary else "Add a 2-3 sentence summary tailored to your target role type.",
    })

    # 5. Quantified achievements (numbers, %, $, x improvement)
    quant_pattern = re.compile(r"\b\d+[\.,]?\d*\s*(%|percent|x|times|users|clients|dollars?|\$|million|k\b|ms\b|seconds?|hours?)")
    has_numbers = bool(quant_pattern.search(t)) or bool(re.search(r"\d{2,}", resume_text))
    checks.append({
        "id": "quantified",
        "label": "Quantified achievements",
        "passed": has_numbers,
        "tip": None if has_numbers else 'Add numbers to bullets: "reduced load time by 40%" beats "improved performance".',
    })

    # 6. Action verbs
    first_words = re.findall(r"(?:^|\n)[•\-\*]?\s*([a-z]+)", t)
    action_verb_count = sum(1 for w in first_words if w in _ACTION_VERBS)
    has_action_verbs = action_verb_count >= 3
    checks.append({
        "id": "action_verbs",
        "label": "Strong action verbs",
        "passed": has_action_verbs,
        "tip": None if has_action_verbs else 'Start bullets with strong verbs: "Led", "Built", "Reduced", "Launched".',
    })

    # 7. Education section
    has_education = any(w in t for w in ["education", "university", "college", "degree", "bachelor", "master", "b.tech", "b.e.", "b.sc"])
    checks.append({
        "id": "education",
        "label": "Education section",
        "passed": has_education,
        "tip": None if has_education else "Add your education history, including degree, institution, and graduation year.",
    })

    # 8. Resume length (too short < 200 words, too long > 900 words for <5 yrs exp)
    word_count = len(resume_text.split())
    length_ok = 200 <= word_count <= 1000
    checks.append({
        "id": "length",
        "label": "Appropriate length",
        "passed": length_ok,
        "tip": None if length_ok else (
            "Resume seems too short — add more detail to your experience and projects."
            if word_count < 200 else
            "Resume may be too long — aim for 1 page (2 max for 5+ years experience)."
        ),
    })

    passed = sum(1 for c in checks if c["passed"])
    score = round((passed / len(checks)) * 100)

    return {
        "score": score,
        "checks": checks,
        "word_count": word_count,
    }
