"""
Resume parser supporting PDF and DOCX.
Extracts: contact info, skills, experience, education, projects, certifications.
"""
from __future__ import annotations

import re
import io
from typing import Optional
from pathlib import Path

import structlog
import pdfplumber
from docx import Document

logger = structlog.get_logger()


# ─── Section Detection ───────────────────────────────────────────────────────

SECTION_HEADERS = {
    "experience": [
        "work experience", "experience", "professional experience",
        "employment history", "work history", "career history",
    ],
    "education": ["education", "academic background", "qualifications", "academic history"],
    "skills": [
        "skills", "technical skills", "core skills", "key skills",
        "competencies", "technologies", "tools", "languages",
    ],
    "projects": ["projects", "personal projects", "side projects", "open source"],
    "certifications": [
        "certifications", "certificates", "awards", "achievements",
        "licenses",
    ],
    "summary": [
        "summary", "profile", "about", "objective", "career objective",
        "professional summary",
    ],
}

# Tech skills corpus for detection
TECH_SKILLS_CORPUS = {
    # Languages
    "python", "javascript", "typescript", "java", "kotlin", "swift", "c++", "c#",
    "go", "golang", "rust", "ruby", "php", "scala", "r", "matlab", "dart", "lua",
    "haskell", "elixir", "clojure", "ocaml", "f#",
    # Web
    "react", "react.js", "next.js", "vue", "vue.js", "angular", "svelte",
    "html", "css", "tailwindcss", "sass", "less", "webpack", "vite",
    "graphql", "rest", "grpc", "websockets",
    # Backend
    "node.js", "express", "fastapi", "django", "flask", "spring", "rails",
    "laravel", ".net", "asp.net",
    # DB
    "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "sqlite",
    "cassandra", "dynamodb", "supabase", "firebase", "neo4j", "clickhouse",
    # Cloud
    "aws", "gcp", "azure", "s3", "ec2", "lambda", "cloudformation", "terraform",
    "kubernetes", "k8s", "docker", "helm", "istio",
    # AI/ML
    "machine learning", "deep learning", "nlp", "computer vision", "tensorflow",
    "pytorch", "sklearn", "scikit-learn", "pandas", "numpy", "huggingface",
    "langchain", "openai", "llm", "rag",
    # DevOps
    "git", "github", "gitlab", "ci/cd", "jenkins", "github actions",
    "ansible", "puppet", "chef",
    # Data
    "spark", "hadoop", "kafka", "airflow", "dbt", "snowflake", "bigquery",
    "tableau", "power bi",
    # Mobile
    "android", "ios", "react native", "flutter", "expo",
    # Other
    "microservices", "api design", "system design", "agile", "scrum",
    "linux", "bash", "shell scripting", "vim",
}


def _reconstruct_lines_from_words(words: list[dict]) -> str:
    """
    Given pdfplumber word objects, group them into lines by y-coordinate
    and join with spaces, preserving reading order.
    """
    if not words:
        return ""

    # Group words into lines: round 'top' to nearest 3 pts to cluster same-line words
    lines: dict[int, list[dict]] = {}
    for w in words:
        line_key = round(w["top"] / 3) * 3
        lines.setdefault(line_key, []).append(w)

    page_lines = []
    for top in sorted(lines.keys()):
        # Sort words left-to-right by x0
        line_words = sorted(lines[top], key=lambda w: w["x0"])
        page_lines.append(" ".join(w["text"] for w in line_words))

    return "\n".join(page_lines)


def _fix_merged_text(text: str) -> str:
    """
    Post-process extracted PDF text to fix common word-merging artifacts.
    Only fixes patterns that are unambiguously wrong (months run into years,
    digits run into capital letters).  CamelCase splitting is intentionally
    avoided because it would break tech keywords like FastAPI, JavaScript, etc.
    """
    # "July2026" → "July 2026", "August2026" → "August 2026"
    text = re.sub(
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"
        r"|January|February|March|April|June|July|August"
        r"|September|October|November|December)(\d{4})",
        r"\1 \2",
        text,
    )
    # "2024Present" → "2024 Present", "2024Current" → "2024 Current"
    text = re.sub(
        r"(\d{4})(Present|Current|Now)",
        r"\1 \2",
        text,
        flags=re.IGNORECASE,
    )
    # "2024–2026" already fine but "20242026" → "2024 2026" (year glued to year)
    text = re.sub(r"(\d{4})(\d{4})", r"\1 \2", text)
    # Collapse multiple spaces on a single line (keep newlines intact)
    lines = [re.sub(r" {2,}", " ", line) for line in text.split("\n")]
    return "\n".join(lines)


def extract_text_from_pdf(content: bytes) -> str:
    """
    Extract full text from PDF bytes.

    Strategy:
    1. PyMuPDF (fitz) first — preserves word spacing most reliably.
    2. Fall back to pdfplumber word reconstruction with strict x_tolerance.
    3. Apply _fix_merged_text() as a final cleanup pass.
    """
    # ── Primary: PyMuPDF ──────────────────────────────────────────────────────
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=content, filetype="pdf")
        parts = []
        for page in doc:
            parts.append(page.get_text("text", sort=True))
        doc.close()
        raw = "\n".join(parts)
        if len(raw.strip()) > 50:
            return _fix_merged_text(raw)
    except Exception as e:
        logger.warning("PyMuPDF failed, trying pdfplumber", error=str(e))

    # ── Fallback: pdfplumber word reconstruction ───────────────────────────
    text_parts = []
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                try:
                    words = page.extract_words(
                        x_tolerance=3,   # tighter — avoids merging adjacent words
                        y_tolerance=5,
                        keep_blank_chars=False,
                    )
                    if words:
                        text_parts.append(_reconstruct_lines_from_words(words))
                    else:
                        page_text = page.extract_text(x_tolerance=7, y_tolerance=5)
                        if page_text:
                            text_parts.append(page_text)
                except Exception:
                    page_text = page.extract_text(x_tolerance=7, y_tolerance=5)
                    if page_text:
                        text_parts.append(page_text)
    except Exception as e:
        logger.error("PDF extraction failed completely", error=str(e))

    raw_text = "\n".join(text_parts)
    return _fix_merged_text(raw_text)


def extract_text_from_docx(content: bytes) -> str:
    """Extract full text from DOCX bytes."""
    try:
        doc = Document(io.BytesIO(content))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n".join(paragraphs)
    except Exception as e:
        logger.error("DOCX extraction failed", error=str(e))
        return ""


def extract_text(content: bytes, filename: str) -> str:
    """Dispatch to correct parser based on file extension."""
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return extract_text_from_pdf(content)
    elif ext in (".docx", ".doc"):
        return extract_text_from_docx(content)
    else:
        # Try decode as plain text
        try:
            return content.decode("utf-8", errors="ignore")
        except Exception:
            return ""


# ─── Section Splitter ────────────────────────────────────────────────────────

def split_into_sections(text: str) -> dict[str, str]:
    """Split resume text into labeled sections."""
    lines = text.split("\n")
    sections: dict[str, list[str]] = {"header": []}
    current_section = "header"

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        detected = _detect_section(stripped)
        if detected:
            current_section = detected
            sections.setdefault(current_section, [])
        else:
            sections.setdefault(current_section, []).append(stripped)

    return {k: "\n".join(v) for k, v in sections.items()}


def _detect_section(line: str) -> Optional[str]:
    """Return section name if line looks like a header, else None."""
    # Must be mostly uppercase or title-case
    cleaned = re.sub(r"[^a-zA-Z\s]", "", line).strip().lower()
    if not cleaned or len(cleaned) > 50:
        return None

    for section, keywords in SECTION_HEADERS.items():
        if any(kw == cleaned or kw in cleaned for kw in keywords):
            return section

    return None


# ─── Field Extractors ────────────────────────────────────────────────────────

def extract_email(text: str) -> Optional[str]:
    match = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text)
    return match.group(0) if match else None


def extract_phone(text: str) -> Optional[str]:
    """Extract phone number — US, Indian, and common international formats."""
    patterns = [
        # US/Canada: (123) 456-7890 / 123-456-7890 / +1 123 456 7890
        r"(?:\+?1[\s.\-]?)?(?:\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})",
        # Indian mobile with country code: +91 98765 43210
        r"(?:\+?91[\s\-]?)?[6-9]\d{4}[\s.\-]\d{5}",
        # Indian 10-digit no separator: 9876543210
        r"(?:\+?91[\s\-]?)?[6-9]\d{9}",
        # Generic grouped: 4–6 digits, separator, 4–6 digits (covers 6-4, 5-5, etc.)
        r"\b\d{4,6}[\s.\-]\d{4,6}\b",
        # Any 10 consecutive digits
        r"\b\d{10}\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            phone = match.group(0).strip()
            digits = re.sub(r"\D", "", phone)
            if 7 <= len(digits) <= 15:
                return phone
    return None


def extract_linkedin(text: str) -> Optional[str]:
    match = re.search(r"linkedin\.com/in/([a-zA-Z0-9\-]+)", text)
    return f"https://linkedin.com/in/{match.group(1)}" if match else None


def extract_github(text: str) -> Optional[str]:
    match = re.search(r"github\.com/([a-zA-Z0-9\-]+)", text)
    return f"https://github.com/{match.group(1)}" if match else None


# Words that commonly appear in professional headlines/titles but are NOT names.
# If any word in a candidate "name" is here, we reject it as a title line.
_TITLE_WORDS = {
    "software", "engineer", "engineering", "developer", "development", "architect",
    "programmer", "designer", "manager", "analyst", "scientist", "researcher",
    "consultant", "specialist", "coordinator", "administrator", "executive",
    "lead", "senior", "junior", "staff", "principal", "director", "head",
    "vice", "president", "officer", "associate", "assistant",
    # Academic / student labels
    "undergraduate", "graduate", "postgraduate", "student", "fresher", "intern",
    "trainee", "bachelor", "masters", "master", "phd", "mba", "btech", "mtech",
    "bsc", "msc", "bca", "mca",
    # Tech domain words
    "tech", "technical", "technology", "technologies", "data", "full", "stack",
    "frontend", "backend", "fullstack", "devops", "cloud", "mobile", "web",
    "cybersecurity", "security", "network", "systems", "infrastructure",
    # Common resume section words
    "profile", "resume", "curriculum", "vitae", "summary", "objective",
    # Other non-name words that occasionally appear at top of resume
    "portfolio", "contact", "information",
}


def _is_title_line(words: list[str]) -> bool:
    """Return True if any word suggests this is a professional headline, not a name."""
    return any(w.lower() in _TITLE_WORDS for w in words)


def _split_camelcase_name(word: str) -> str:
    """
    Split a CamelCase word that looks like a merged name.
    e.g. 'UjjwalKalra' → 'Ujjwal Kalra'.
    Only splits at lowercase→uppercase boundaries; leaves ALL_CAPS and tech
    abbreviations (e.g. 'PhD', 'MCom') alone.
    """
    if word.isupper() or word.islower():
        return word
    return re.sub(r"([a-z])([A-Z])", r"\1 \2", word)


def extract_name_from_header(header_text: str) -> Optional[str]:
    """Extract candidate name from the top section of the resume."""
    _NAME_WORD = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿऀ-ॿ\-\'\.]+$")
    _ALLOWED_SHORT = {"de", "van", "von", "bin", "binti", "jr", "sr", "ii", "iii", "iv", "phd", "md"}

    single_word_candidates: list[str] = []

    for line in header_text.split("\n"):
        line = line.strip()
        if not line or len(line) > 80:
            continue
        if re.search(r"@|http|www\.|linkedin|github|portfolio", line.lower()):
            continue
        if re.search(r"\d", line):
            continue

        words = line.split()
        if not (1 <= len(words) <= 5):
            continue

        cleaned_words = [w.rstrip(".,;:|•–—") for w in words]
        if not all(_NAME_WORD.match(w) or w.lower() in _ALLOWED_SHORT for w in cleaned_words):
            continue

        if 2 <= len(words) <= 4:
            # Skip lines that look like professional titles/headlines
            if _is_title_line(cleaned_words):
                continue
            # Normalise ALL-CAPS to Title-Case (e.g. "UJJWAL KALRA" → "Ujjwal Kalra")
            normalized = " ".join(
                w.title() if w.isupper() and len(w) > 1 else w
                for w in cleaned_words
            )
            return normalized

        if len(words) == 1:
            split = _split_camelcase_name(cleaned_words[0])
            if " " in split:
                return split
            single_word_candidates.append(cleaned_words[0])

    if single_word_candidates:
        return single_word_candidates[0]

    # Fallback 1: strip contact info from the first line and try again.
    # Handles PDFs where name and phone/email are on the same line.
    first_lines = [ln.strip() for ln in header_text.split("\n") if ln.strip()][:3]
    for first_line in first_lines:
        cleaned = re.sub(r"[\w.+\-]+@[\w\-]+\.[a-zA-Z]{2,}", "", first_line)
        cleaned = re.sub(r"\+?[\d][\d\s\-\(\)\.]{6,}", "", cleaned)
        cleaned = re.sub(r"https?://\S+|www\.\S+", "", cleaned)
        cleaned = re.sub(r"[|•·/\\–—]", " ", cleaned)
        cleaned = re.sub(r"[,;:]", "", cleaned).strip()
        cleaned = re.sub(r"\s{2,}", " ", cleaned)
        if not cleaned:
            continue
        parts = cleaned.split()
        if 2 <= len(parts) <= 4 and all(re.match(r"^[A-Za-z\'\-\.]+$", p) for p in parts):
            if not _is_title_line(parts):
                return " ".join(
                    p.title() if p.isupper() and len(p) > 1 else p
                    for p in parts
                )

    # Fallback 2: scan the first 400 chars for a Title-Case name sequence.
    text_start = re.sub(r"\s+", " ", header_text[:400])
    name_re = re.compile(r"\b([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){1,3})\b")
    for m in name_re.finditer(text_start):
        candidate = m.group(1)
        parts = candidate.split()
        if all(_NAME_WORD.match(p) for p in parts) and not _is_title_line(parts):
            return candidate

    # Fallback 3: scan for ALL-CAPS name sequence (2–4 words, 2+ chars each).
    caps_re = re.compile(r"\b([A-Z]{2,}(?:\s+[A-Z]{2,}){1,3})\b")
    for m in caps_re.finditer(text_start):
        candidate_parts = m.group(1).split()
        if all(re.match(r"^[A-Z]+$", p) for p in candidate_parts) and not _is_title_line(candidate_parts):
            return " ".join(p.title() for p in candidate_parts)

    return None


def looks_like_title(name: str) -> bool:
    """Return True if the extracted 'name' looks like a professional headline, not a real name."""
    if not name:
        return False
    words = name.split()
    return _is_title_line(words)


def extract_skills_from_text(text: str) -> list[str]:
    """Extract tech skills from raw text using corpus matching."""
    text_lower = text.lower()
    found = set()
    for skill in TECH_SKILLS_CORPUS:
        # Word boundary matching
        pattern = r"(?<![a-zA-Z])" + re.escape(skill) + r"(?![a-zA-Z])"
        if re.search(pattern, text_lower):
            found.add(skill.title() if len(skill) > 3 else skill.upper())
    return sorted(found)


def extract_bullets(section_text: str) -> list[str]:
    """Extract bullet points from a section."""
    bullets = []
    for line in section_text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # Remove common bullet symbols
        cleaned = re.sub(r"^[•·▪▸►\-\*\>]\s*", "", line).strip()
        if cleaned and len(cleaned) > 15:
            bullets.append(cleaned)
    return bullets


def parse_experience_section(text: str) -> list[dict]:
    """Parse work experience entries."""
    experiences = []
    current: Optional[dict] = None

    # Patterns for job titles and dates
    date_pattern = re.compile(
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|"
        r"April|May|June|July|August|September|October|November|December)\.?\s+\d{4}"
        r"|(\d{4})\s*([-–—to]+)\s*(\d{4}|Present|Current|Now)",
        re.IGNORECASE,
    )

    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        # Detect new job entry (line with dates)
        has_date = bool(date_pattern.search(line))
        if has_date or (current is None and line and not line.startswith("•")):
            if current:
                experiences.append(current)

            # Try to extract company and title from this and next line
            current = {
                "title": "",
                "company": "",
                "location": "",
                "start_date": "",
                "end_date": "",
                "is_current": False,
                "bullets": [],
            }

            # Extract dates from line
            dates = date_pattern.findall(line)
            if dates:
                date_str = date_pattern.search(line).group(0)
                parts = re.split(r"[-–—to]+", date_str, flags=re.IGNORECASE)
                if len(parts) >= 1:
                    current["start_date"] = parts[0].strip()
                if len(parts) >= 2:
                    end = parts[1].strip()
                    if re.search(r"present|current|now", end, re.IGNORECASE):
                        current["is_current"] = True
                        current["end_date"] = "Present"
                    else:
                        current["end_date"] = end

            # Title is typically before the date, company on next/same line
            title_part = date_pattern.sub("", line).strip()
            title_part = re.sub(r"\s+", " ", title_part).strip(" |·-")
            if title_part:
                current["title"] = title_part

        elif current is not None:
            if not current["company"] and line and not line.startswith("•"):
                current["company"] = line
            elif line.startswith("•") or (line and len(line) > 20):
                cleaned = re.sub(r"^[•·▪▸►\-\*]\s*", "", line).strip()
                if cleaned:
                    current["bullets"].append(cleaned)
        i += 1

    if current:
        experiences.append(current)

    return [e for e in experiences if e.get("title") or e.get("company")]


def parse_education_section(text: str) -> list[dict]:
    """Parse education entries."""
    education = []
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    i = 0
    while i < len(lines):
        line = lines[i]
        # Look for degree keywords
        if re.search(
            r"\b(B\.?S\.?|M\.?S\.?|Ph\.?D\.?|Bachelor|Master|MBA|B\.?E\.?|B\.?Tech|M\.?Tech|"
            r"B\.?Sc|M\.?Sc|Associate|Diploma|High School)\b",
            line,
            re.IGNORECASE,
        ):
            edu = {"degree": line, "institution": "", "gpa": "", "end_date": ""}

            # Next non-empty line is likely institution
            if i + 1 < len(lines):
                edu["institution"] = lines[i + 1]

            # GPA
            gpa_match = re.search(r"GPA:?\s*([\d.]+)", text[text.find(line):], re.IGNORECASE)
            if gpa_match:
                edu["gpa"] = gpa_match.group(1)

            # Year
            year_match = re.search(r"\b(20\d\d|19\d\d)\b", line)
            if year_match:
                edu["end_date"] = year_match.group(1)

            education.append(edu)
        i += 1

    return education


def parse_projects_section(text: str) -> list[dict]:
    """Parse projects."""
    projects = []
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    current: Optional[dict] = None

    for line in lines:
        if not line.startswith("•") and len(line) < 80 and not re.search(r"\d{4}", line):
            if current:
                projects.append(current)
            current = {
                "name": line,
                "description": "",
                "tech_stack": [],
                "bullets": [],
            }
        elif current:
            cleaned = re.sub(r"^[•·▪▸►\-\*]\s*", "", line).strip()
            if cleaned:
                current["bullets"].append(cleaned)
                # Extract tech from bullets
                for skill in TECH_SKILLS_CORPUS:
                    if re.search(r"(?<![a-zA-Z])" + re.escape(skill) + r"(?![a-zA-Z])", cleaned.lower()):
                        tech = skill.title() if len(skill) > 3 else skill.upper()
                        if tech not in current["tech_stack"]:
                            current["tech_stack"].append(tech)

    if current:
        projects.append(current)

    return [p for p in projects if p.get("name")]


# ─── Main Parse Function ─────────────────────────────────────────────────────

def parse_resume(text: str) -> dict:
    """
    Parse raw resume text into structured data.
    Returns a dict matching the ParsedResume TypeScript interface.
    """
    sections = split_into_sections(text)
    header_text = sections.get("header", "")
    full_text = text

    # Contact info
    contact = {
        "name": extract_name_from_header(header_text),
        "email": extract_email(full_text),
        "phone": extract_phone(full_text),
        "linkedin": extract_linkedin(full_text),
        "github": extract_github(full_text),
    }

    # Skills
    skills_text = sections.get("skills", "") + "\n" + full_text
    skills = extract_skills_from_text(skills_text)

    # Experience
    experience = parse_experience_section(sections.get("experience", ""))

    # Education
    education = parse_education_section(sections.get("education", ""))

    # Projects
    projects = parse_projects_section(sections.get("projects", ""))

    # Summary
    summary = sections.get("summary", "")[:500] if sections.get("summary") else None

    return {
        "contact": contact,
        "summary": summary,
        "skills": skills,
        "experience": experience,
        "education": education,
        "projects": projects,
        "certifications": [],
        "raw_sections": {k: v[:2000] for k, v in sections.items()},
    }
