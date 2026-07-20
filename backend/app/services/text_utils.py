"""Shared text preprocessing utilities."""
from __future__ import annotations

_JD_SECTION_MARKERS = [
    "minimum qualifications", "preferred qualifications", "required qualifications",
    "basic qualifications", "requirements:", "responsibilities:", "key responsibilities",
    "what you'll do", "what you will do", "about the job", "about the role",
    "role overview", "job description", "your role", "what you bring",
    "skills required", "required skills", "must have", "qualifications:",
    "duties and responsibilities", "job summary", "position summary",
    "what we're looking for", "who you are", "the impact you'll have",
]


def smart_truncate_jd(text: str, max_chars: int = 2000, head_reserve: int = 250) -> str:
    """
    Truncate job description text to max_chars, prioritizing substantive content.

    Real scraped job postings (career pages especially) often lead with pages of
    legal/logistics boilerplate — application windows, equal-opportunity/fair-chance
    text, location lists, "how to apply" instructions — before the actual
    qualifications and responsibilities. A naive text[:max_chars] slice can cut off
    every bit of substantive content for postings shaped this way, leaving the
    scorer nothing to judge fit against (confirmed: a real Google internship
    posting had its "Minimum qualifications:" section start at character 3,417,
    well past a 2,000-char cutoff).

    JDs that already fit within max_chars are returned completely unchanged — this
    only changes behavior for JDs that would otherwise be truncated, so short/simple
    postings keep full precision with zero risk of this logic touching them.
    """
    if not text or len(text) <= max_chars:
        return text

    lower = text.lower()
    earliest_idx = None
    for marker in _JD_SECTION_MARKERS:
        idx = lower.find(marker)
        if idx != -1 and (earliest_idx is None or idx < earliest_idx):
            earliest_idx = idx

    if earliest_idx is None or earliest_idx <= head_reserve:
        # No recognizable section marker, or substantive content already starts
        # early — the original first-N-chars behavior is already fine here.
        return text[:max_chars]

    head = text[:head_reserve].rstrip()
    remaining_budget = max_chars - len(head) - 5  # 5 chars reserved for the "\n...\n" separator
    body = text[earliest_idx:earliest_idx + remaining_budget]
    return f"{head}\n...\n{body}"
