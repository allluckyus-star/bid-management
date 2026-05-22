"""Job text extraction via Ollama (falls back to heuristic mock)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any
import httpx

from app.config import settings
from app.schemas import JobExtractionResult
from app.services.html_capture import (
    _FORM_LINE,
    drop_form_and_noise_lines,
    infer_company_from_text,
    is_invalid_company,
    merge_capture_sources,
)

logger = logging.getLogger(__name__)

PROMPT_VERSION = "v4-tags-salary"

# Lines that are almost never part of the job posting body
_NOISE_LINE = re.compile(
    r"^(?:share|save|apply now|easy apply|report job|show more|see more|"
    r"cookie|privacy policy|sign in|log in|linkedin|indeed|glassdoor|"
    r"©|all rights reserved|follow us|similar jobs|recommended jobs|"
    r"people also viewed).*$",
    re.I,
)

_SALARY_AMOUNT = re.compile(
    r"(?:\$\s*[\d]{1,3}(?:,\d{3})+(?:\.\d{2})?|\$\s*[\d]+(?:\.\d{2})?|\$\s*[\d]+\s*k\b|"
    r"[\d]{1,3}(?:,\d{3})+\s*(?:USD|usd)?|\d+k\s*-\s*\d+k)",
    re.I,
)

_SALARY_BOILERPLATE = re.compile(
    r"(?:salary\s+range(?:s)?\s+for\s+this|base\s+salary\s+range(?:s)?|"
    r"compensation\s+for\s+this\s+position|pay\s+range(?:s)?\s+for\s+this|"
    r"annual\s+base\s+salary\s+range(?:s)?\s+for)",
    re.I,
)

_PERIOD_HINTS = {
    "hourly": re.compile(r"\b(?:per\s+hour|/hr|/hour|hourly)\b", re.I),
    "monthly": re.compile(r"\b(?:per\s+month|/month|monthly)\b", re.I),
    "annual": re.compile(
        r"\b(?:per\s+year|/year|/yr|annual(?:ly)?|yearly|per\s+annum|p\.?a\.?)\b", re.I
    ),
}

SYSTEM_PROMPT = """You extract structured data from job posting pages for a bid-tracking database.
Input may include STRUCTURED_FROM_HTML (from page HTML), PAGE_TITLE, SOURCE_URL.
Return ONLY one JSON object. No markdown fences, no explanation, no keys outside the schema.

Schema (use exactly these keys):
{
  "company_name": "",
  "job_title": "",
  "location": "",
  "salary_text": "",
  "salary_min": null,
  "salary_max": null,
  "salary_currency": "USD",
  "salary_period": null,
  "employment_type": "",
  "seniority": "",
  "required_skills": [],
  "nice_to_have_skills": [],
  "cleaned_job_description": "",
  "hiring_contact": null,
  "confidence": 0.0
}

salary_period: "hourly", "monthly", "annual", or null.

company_name
- Employer for THIS role only (not LinkedIn, Indeed, Glassdoor, Greenhouse, Lever, etc.).
- NEVER use UI/nav words: Apply, Apply now, Skip to main content, Search, Menu, Share, Save, Submit, Home.
- Prefer evidence in prose: "At Acme Corp", "Acme's engineering team", "About Stripe", "Join Datadog".
- PAGE_TITLE often has "Role | Company" — company may be after the last pipe.
- If no reliable employer name, leave "".

job_title
- Position name only (e.g. "Senior Backend Engineer"). Not company, not "Job Description".

location
- As stated (city). "" if missing.

salary_text
- ONLY pay amounts in one of these display forms (no job title or experience text):
  Range: "$127,000 - $171,000" OR "$127K-$171K" OR "$25/hr-$35/hr" OR "$127K/hr-$171K/hr" OR "$127K/yr-$171K/yr"
  Single: "$85,000" OR "$85K" OR "$45/hr" OR "$120K/yr"
- Use K only for round thousands (120000 → $120K). Use full commas for smaller amounts ($950 - $1,100).
- Put /hr or /yr on EACH side of a range when hourly or annual.
- salary_min / salary_max: integers (127000 not 127K). salary_period: hourly, monthly, annual, or null.

cleaned_job_description
- Structured JD sections only: About the role, Responsibilities, Requirements, Qualifications, Skills, Benefits (role-related).
- Preserve section headings and bullet lists from the posting.
- EXCLUDE application forms: first name, last name, email, phone, upload resume, cover letter, work authorization, visa, "submit application", required field markers.
- EXCLUDE nav, ads, similar jobs, cookies, social links, "Apply now".
- Do NOT paste the full raw page; summarize if needed but keep real requirement bullets.

employment_type, seniority, required_skills, nice_to_have_skills — only if clearly stated.
confidence — 0.0-1.0. Never invent facts."""


def prepare_capture_text(
    captured_html: str,
    page_title: str,
    source_url: str,
    *,
    legacy_plain_text: str | None = None,
) -> str:
    """Turn sanitized HTML into text for the model (and tag inference)."""
    prepared, _html_excerpt = merge_capture_sources(
        captured_html,
        page_title,
        source_url,
        legacy_plain_text=legacy_plain_text,
    )
    return prepared[:20000]


def _user_message(prepared_text: str, html_excerpt: str) -> str:
    parts = [f"Extract job fields from this captured job posting:\n\n{prepared_text}"]
    if html_excerpt.strip():
        parts.append(
            "\n\n--- HTML excerpt (for section structure; ignore forms/buttons) ---\n"
            + html_excerpt[:12000]
        )
    return "".join(parts)


def _parse_k_amount(token: str) -> int | None:
    t = token.strip().replace(",", "").replace("$", "").lower()
    m = re.match(r"^(\d+(?:\.\d+)?)k$", t)
    if m:
        return int(float(m.group(1)) * 1000)
    m = re.match(r"^(\d+)$", t)
    if m:
        return int(m.group(1))
    return None


def _parse_amounts_from_text(text: str) -> tuple[int | None, int | None]:
    """Pull min/max integers from salary_text when model left them null."""
    if not text:
        return None, None
    nums: list[int] = []
    for m in re.finditer(
        r"\$\s*([\d,]+(?:\.\d+)?)\s*(K)?",
        text,
        re.I,
    ):
        raw = m.group(1).replace(",", "")
        if not raw:
            continue
        if (m.group(2) or "").lower() == "k":
            v = int(float(raw) * 1000)
        else:
            v = int(float(raw.split(".")[0]))
        nums.append(v)
    for m in re.finditer(r"\b(\d+(?:\.\d+)?)\s*k\b", text, re.I):
        if "$" in text[max(0, m.start() - 2) : m.start()]:
            continue
        nums.append(int(float(m.group(1)) * 1000))
    if not nums:
        return None, None
    return min(nums), max(nums)


def _detect_period(text: str) -> str | None:
    if not text:
        return None
    for name, pat in _PERIOD_HINTS.items():
        if pat.search(text):
            return name
    return None


def _is_valid_salary_text(s: str) -> bool:
    s = (s or "").strip()
    if not s or len(s) < 4:
        return False
    if _SALARY_BOILERPLATE.search(s) and not _SALARY_AMOUNT.search(s):
        return False
    return bool(_SALARY_AMOUNT.search(s))


def _normalize_period(raw: str | None) -> str | None:
    if not raw:
        return None
    low = raw.strip().lower()
    if low in ("hourly", "hr", "hour"):
        return "hourly"
    if low in ("monthly", "month"):
        return "monthly"
    if low in ("annual", "yearly", "year", "annually"):
        return "annual"
    return None


def _period_unit_suffix(period: str | None) -> str:
    if period == "hourly":
        return "/hr"
    if period == "annual":
        return "/yr"
    if period == "monthly":
        return "/mo"
    return ""


def _use_k_notation(amount: int) -> bool:
    return amount >= 1000 and amount % 1000 == 0


def _format_money(amount: int, *, use_k: bool, unit_suffix: str) -> str:
    if use_k:
        body = f"${amount // 1000}K"
    else:
        body = f"${amount:,}"
    return f"{body}{unit_suffix}"


def _compact_salary_display(
    raw_text: str,
    salary_min: int | None,
    salary_max: int | None,
    period: str | None,
) -> tuple[str, int | None, int | None, str | None]:
    """Normalize to $.. / $..K with optional /hr or /yr per user display rules."""
    blob = (raw_text or "").strip()
    period = period or _detect_period(blob)
    unit = _period_unit_suffix(period)

    pmin, pmax = _parse_amounts_from_text(blob)
    if salary_min is None and pmin is not None:
        salary_min = pmin
    if salary_max is None and pmax is not None:
        salary_max = pmax

    if salary_min is None and salary_max is None:
        return "", None, None, period

    lo = salary_min if salary_min is not None else salary_max
    hi = salary_max if salary_max is not None else salary_min
    if lo is None or hi is None:
        return "", None, None, period

    if lo > hi:
        lo, hi = hi, lo

    blob_has_k = bool(re.search(r"\$\s*[\d,]+\s*[kK]\b", blob))
    use_k = (
        _use_k_notation(lo)
        and _use_k_notation(hi)
        and (blob_has_k or not re.search(r"\$\s*\d{1,3},\d{3}", blob))
    )

    if hi != lo:
        if unit:
            base = (
                f"{_format_money(lo, use_k=use_k, unit_suffix=unit)}"
                f"-{_format_money(hi, use_k=use_k, unit_suffix=unit)}"
            )
        elif use_k:
            base = f"${lo // 1000}K-${hi // 1000}K"
        else:
            base = f"${lo:,} - ${hi:,}"
    else:
        base = _format_money(lo, use_k=use_k, unit_suffix=unit)

    return base, lo, hi, period


def _is_form_or_ui_line(line: str) -> bool:
    if _NOISE_LINE.match(line):
        return True
    if _FORM_LINE.search(line):
        return True
    return line.strip().lower() in {"apply", "apply now", "skip to main content", "submit"}


def _fallback_clean_jd(prepared: str) -> str:
    """Heuristic JD when model returns empty or copies everything."""
    lines = prepared.splitlines()
    keep: list[str] = []
    section_markers = re.compile(
        r"(?:^#+\s|responsibilit|requirement|qualification|about (?:the )?(?:role|job|position)|"
        r"what you|you will|you'll|must have|nice to have|benefits|skills|experience|duties|"
        r"who you are|what we|role overview)",
        re.I,
    )
    in_body = False
    skip_prefixes = (
        "PAGE_TITLE:",
        "SOURCE_URL:",
        "URL_HOST:",
        "STRUCTURED_FROM_HTML:",
        "STRUCTURED_FROM_DOM:",
    )
    for line in lines:
        if any(line.startswith(p) for p in skip_prefixes):
            continue
        if _is_form_or_ui_line(line):
            continue
        if section_markers.search(line):
            in_body = True
        if in_body or (len(line) > 40 and not _is_form_or_ui_line(line)):
            keep.append(line)
    body = drop_form_and_noise_lines("\n".join(keep)).strip()
    if len(body) > 8000:
        body = body[:8000] + "\n…"
    return body or prepared[:8000]


def _title_from_page_title(page_title: str) -> tuple[str, str]:
    """Many boards use 'Role | Company' in the browser tab title."""
    t = page_title.strip()
    if "|" not in t:
        return t, ""
    parts = [p.strip() for p in t.split("|") if p.strip()]
    if len(parts) >= 2:
        return parts[0], parts[-1]
    return t, ""


def normalize_extraction(
    data: dict[str, Any],
    prepared_text: str,
    page_title: str,
) -> JobExtractionResult:
    """Validate model JSON and fix common salary/company mistakes."""
    title_hint, company_hint = _title_from_page_title(page_title)
    company = (data.get("company_name") or company_hint or "").strip()
    if is_invalid_company(company):
        company = ""
    if not company:
        company = infer_company_from_text(prepared_text)
    if is_invalid_company(company):
        company = ""
    title = (data.get("job_title") or title_hint or "").strip()
    if title.lower() in ("job description", "careers", "open positions", "jobs"):
        title = ""

    location = (data.get("location") or "").strip()
    raw_salary = (data.get("salary_text") or "").strip()
    if raw_salary and not _SALARY_AMOUNT.search(raw_salary):
        raw_salary = ""

    salary_min = data.get("salary_min")
    salary_max = data.get("salary_max")
    if isinstance(salary_min, float):
        salary_min = int(salary_min)
    if isinstance(salary_max, float):
        salary_max = int(salary_max)

    period = _normalize_period(data.get("salary_period"))
    salary_text, salary_min, salary_max, period = _compact_salary_display(
        raw_salary, salary_min, salary_max, period
    )
    if not period and raw_salary:
        period = _detect_period(raw_salary)

    currency = (data.get("salary_currency") or "USD").strip() or "USD"

    cleaned = drop_form_and_noise_lines((data.get("cleaned_job_description") or "").strip())
    raw_ratio = len(cleaned) / max(len(prepared_text), 1)
    if not cleaned or raw_ratio > 0.92:
        cleaned = _fallback_clean_jd(prepared_text)
    else:
        cleaned_lines = [ln for ln in cleaned.splitlines() if not _is_form_or_ui_line(ln)]
        cleaned = "\n".join(cleaned_lines).strip()

    skills_req = data.get("required_skills") or []
    skills_nice = data.get("nice_to_have_skills") or []
    if not isinstance(skills_req, list):
        skills_req = []
    if not isinstance(skills_nice, list):
        skills_nice = []

    confidence = data.get("confidence")
    try:
        confidence = float(confidence) if confidence is not None else 0.5
    except (TypeError, ValueError):
        confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))

    return JobExtractionResult(
        company_name=company,
        job_title=title,
        location=location,
        salary_text=salary_text,
        salary_min=salary_min if isinstance(salary_min, int) else None,
        salary_max=salary_max if isinstance(salary_max, int) else None,
        salary_currency=currency,
        salary_period=period,
        employment_type=(data.get("employment_type") or "").strip(),
        seniority=(data.get("seniority") or "").strip(),
        required_skills=[str(s).strip() for s in skills_req if str(s).strip()],
        nice_to_have_skills=[str(s).strip() for s in skills_nice if str(s).strip()],
        cleaned_job_description=cleaned,
        hiring_contact=data.get("hiring_contact"),
        confidence=confidence,
    )


def mock_extract_job_data(
    captured_html: str,
    page_title: str,
    source_url: str,
    *,
    legacy_plain_text: str | None = None,
) -> JobExtractionResult:
    prepared = prepare_capture_text(
        captured_html, page_title, source_url, legacy_plain_text=legacy_plain_text
    )
    lines = [
        ln
        for ln in prepared.splitlines()
        if ln.strip()
        and not ln.startswith(("PAGE_TITLE:", "SOURCE_URL:", "URL_HOST:"))
    ]

    title, company_from_title = _title_from_page_title(page_title)
    if title.lower() in ("job description", "careers", ""):
        title = ""

    company = company_from_title
    if is_invalid_company(company):
        company = ""
    inferred = infer_company_from_text(prepared)
    if inferred:
        company = inferred

    location = ""
    salary_text = ""
    for line in lines:
        if not location and re.search(
            r"\b(remote|hybrid|on-?site)\b|[A-Z][a-z]+,\s*[A-Z]{2}\b", line
        ):
            location = line[:200]
        if not salary_text and _is_valid_salary_text(line):
            salary_text = line[:240]

    if not title:
        for line in lines[:15]:
            if re.search(
                r"\b(engineer|developer|manager|analyst|designer|architect|lead|director)\b",
                line,
                re.I,
            ):
                title = line[:200]
                break

    period = _detect_period(salary_text)
    smin, smax = _parse_amounts_from_text(salary_text)
    salary_text, smin, smax, period = _compact_salary_display(salary_text, smin, smax, period)

    cleaned = _fallback_clean_jd(prepared)

    return JobExtractionResult(
        company_name=company,
        job_title=title,
        location=location,
        salary_text=salary_text,
        salary_min=smin,
        salary_max=smax,
        salary_currency="USD",
        salary_period=period,
        employment_type="",
        seniority="",
        required_skills=[],
        nice_to_have_skills=[],
        cleaned_job_description=cleaned,
        hiring_contact=None,
        confidence=0.35,
    )


def _parse_llm_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if not text:
        raise ValueError("empty model response")
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    # Sometimes model wraps extra text; grab first JSON object
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


def _extraction_messages(
    prepared: str, html_excerpt: str
) -> tuple[list[dict[str, str]], str]:
    user_content = _user_message(prepared, html_excerpt)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]
    return messages, user_content


async def groq_extract_job_data(
    captured_html: str,
    page_title: str,
    source_url: str,
    *,
    legacy_plain_text: str | None = None,
) -> tuple[JobExtractionResult, str, str]:
    api_key = settings.groq_api_key.strip()
    if not api_key:
        raise ValueError("Groq API key not configured")

    prepared = prepare_capture_text(
        captured_html, page_title, source_url, legacy_plain_text=legacy_plain_text
    )
    _, html_excerpt = merge_capture_sources(
        captured_html, page_title, source_url, legacy_plain_text=legacy_plain_text
    )
    messages, _ = _extraction_messages(prepared, html_excerpt)
    base = settings.groq_base_url.rstrip("/")

    body: dict[str, Any] = {
        "model": settings.groq_model,
        "messages": messages,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        res = await client.post(f"{base}/chat/completions", json=body, headers=headers)
        res.raise_for_status()
        payload = res.json()

    choices = payload.get("choices") or []
    if not choices:
        raise ValueError("Groq returned no choices")
    raw_response = choices[0].get("message", {}).get("content", "") or ""
    data = _parse_llm_json(raw_response)
    result = normalize_extraction(data, prepared, page_title)
    model_label = f"groq:{settings.groq_model}"
    return result, model_label, json.dumps(result.model_dump())


async def ollama_extract_job_data(
    captured_html: str,
    page_title: str,
    source_url: str,
    *,
    legacy_plain_text: str | None = None,
) -> tuple[JobExtractionResult, str, str]:
    prepared = prepare_capture_text(
        captured_html, page_title, source_url, legacy_plain_text=legacy_plain_text
    )
    _, html_excerpt = merge_capture_sources(
        captured_html, page_title, source_url, legacy_plain_text=legacy_plain_text
    )
    base = settings.ollama_base_url.rstrip("/")

    messages, user_content = _extraction_messages(prepared, html_excerpt)
    body: dict[str, Any] = {
        "model": settings.ollama_model,
        "messages": messages,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.1},
    }

    raw_response = ""
    async with httpx.AsyncClient(timeout=180.0) as client:
        try:
            res = await client.post(f"{base}/api/chat", json=body)
            res.raise_for_status()
            payload = res.json()
            raw_response = payload.get("message", {}).get("content", "") or ""
        except Exception as chat_err:
            logger.warning("Ollama chat failed (%s), trying /api/generate", chat_err)
            gen_body = {
                "model": settings.ollama_model,
                "prompt": f"{SYSTEM_PROMPT}\n\n{user_content}",
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.1},
            }
            res = await client.post(f"{base}/api/generate", json=gen_body)
            res.raise_for_status()
            payload = res.json()
            raw_response = payload.get("response", "") or ""

    data = _parse_llm_json(raw_response)
    result = normalize_extraction(data, prepared, page_title)
    model_label = f"ollama:{settings.ollama_model}"
    return result, model_label, json.dumps(result.model_dump())


async def extract_job_data(
    captured_html: str,
    page_title: str,
    source_url: str,
    *,
    legacy_plain_text: str | None = None,
) -> tuple[JobExtractionResult, str, str]:
    if settings.use_mock_extraction:
        result = mock_extract_job_data(
            captured_html, page_title, source_url, legacy_plain_text=legacy_plain_text
        )
        return result, "mock-heuristic", json.dumps(result.model_dump())

    if settings.groq_api_key.strip():
        try:
            return await groq_extract_job_data(
                captured_html,
                page_title,
                source_url,
                legacy_plain_text=legacy_plain_text,
            )
        except Exception as err:
            logger.warning("Groq extraction failed, trying Ollama: %s", err)

    try:
        return await ollama_extract_job_data(
            captured_html,
            page_title,
            source_url,
            legacy_plain_text=legacy_plain_text,
        )
    except Exception as err:
        logger.warning("Ollama extraction failed, using mock fallback: %s", err)
        result = mock_extract_job_data(
            captured_html,
            page_title,
            source_url,
            legacy_plain_text=legacy_plain_text,
        )
        return result, "mock-heuristic-fallback", json.dumps(result.model_dump())
