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
    1. Use pdfplumber.extract_words() to get individual word bounding boxes,
       then reconstruct lines by grouping on y-coordinate and joining with a
       single space.  This avoids the x_tolerance merging problem entirely.
    2. Fall back to pdfplumber.extract_text() with a relaxed x_tolerance (7)
       if extract_words returns nothing for a page.
    3. Fall back to PyMuPDF (fitz) if pdfplumber fails completely.
    4. Apply _fix_merged_text() as a final cleanup pass.
    """
    text_parts = []
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                try:
                    words = page.extract_words(
                        x_tolerance=5,
                        y_tolerance=5,
                        keep_blank_chars=False,
                    )
                    if words:
                        text_parts.append(_reconstruct_lines_from_words(words))
                    else:
                        # Page has no selectable text (image-only), try extract_text
                        page_text = page.extract_text(x_tolerance=7, y_tolerance=5)
                        if page_text:
                            text_parts.append(page_text)
                except Exception:
                    # Per-page fallback
                    page_text = page.extract_text(x_tolerance=7, y_tolerance=5)
                    if page_text:
                        text_parts.append(page_text)
    except Exception as e:
        logger.warning("pdfplumber failed, trying fallback", error=str(e))
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=content, filetype="pdf")
            for page in doc:
                text_parts.append(page.get_text())
        except Exception as e2:
            logger.error("PDF extraction failed", error=str(e2))

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
    match = re.search(
        r"(\+?1?\s?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})", text
    )
    return match.group(0).strip() if match else None


def extract_linkedin(text: str) -> Optional[str]:
    match = re.search(r"linkedin\.com/in/([a-zA-Z0-9\-]+)", text)
    return f"https://linkedin.com/in/{match.group(1)}" if match else None


def extract_github(text: str) -> Optional[str]:
    match = re.search(r"github\.com/([a-zA-Z0-9\-]+)", text)
    return f"https://github.com/{match.group(1)}" if match else None


def extract_name_from_header(header_text: str) -> Optional[str]:
    """Extract name from top of resume (first non-email, non-phone line)."""
    for line in header_text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # Skip lines that look like contact info
        if re.search(r"@|http|www\.|linkedin|github|\d{3}[-.\s]\d{3}", line.lower()):
            continue
        # Must look like a name: 2-4 words, mostly alpha
        words = line.split()
        if 2 <= len(words) <= 4 and all(re.match(r"^[A-Za-z\-'\.]+$", w) for w in words):
            return line
    return None


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
