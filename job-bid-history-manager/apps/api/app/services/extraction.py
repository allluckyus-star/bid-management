"""Job text extraction via Ollama (falls back to heuristic mock)."""

from __future__ import annotations

import json
import re

import httpx

from app.config import settings
from app.schemas import JobExtractionResult

PROMPT_VERSION = "v1-ollama"
OLLAMA_PROMPT = """Extract structured job posting data from the visible page text below.
Return ONLY valid JSON with this exact schema (no markdown, no commentary):
{
  "company_name": "",
  "job_title": "",
  "location": "",
  "salary_text": "",
  "salary_min": null,
  "salary_max": null,
  "salary_currency": "USD",
  "employment_type": "",
  "seniority": "",
  "required_skills": [],
  "nice_to_have_skills": [],
  "cleaned_job_description": "",
  "hiring_contact": null,
  "confidence": 0.0
}
Rules: If missing, use null or empty string. Do not invent details not present in the text.
"""


def mock_extract_job_data(captured_text: str, page_title: str, source_url: str) -> JobExtractionResult:
    lines = [ln.strip() for ln in captured_text.splitlines() if ln.strip()]
    company = ""
    title = page_title.strip() if page_title else ""
    location = ""
    salary_text = ""

    for line in lines[:30]:
        low = line.lower()
        if not salary_text and re.search(r"\$[\d,]+|\d+k|\d+\s*/\s*year|salary", low):
            salary_text = line[:200]
        if not location and re.search(r"\b(remote|hybrid|on-?site)\b|[A-Z][a-z]+,\s*[A-Z]{2}\b", line):
            location = line[:200]

    if not title and lines:
        title = lines[0][:200]
    if not company and len(lines) > 1:
        company = lines[1][:200]

    cleaned = "\n".join(lines)
    if len(cleaned) > 12000:
        cleaned = cleaned[:12000] + "\n…"

    return JobExtractionResult(
        company_name=company,
        job_title=title,
        location=location,
        salary_text=salary_text,
        salary_min=None,
        salary_max=None,
        salary_currency="USD",
        employment_type="",
        seniority="",
        required_skills=[],
        nice_to_have_skills=[],
        cleaned_job_description=cleaned,
        hiring_contact=None,
        confidence=0.35,
    )


def _parse_ollama_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


async def ollama_extract_job_data(captured_text: str) -> tuple[JobExtractionResult, str, str]:
    url = f"{settings.ollama_base_url.rstrip('/')}/api/generate"
    body = {
        "model": settings.ollama_model,
        "prompt": f"{OLLAMA_PROMPT}\n\n--- JOB TEXT ---\n{captured_text[:14000]}",
        "stream": False,
        "format": "json",
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        res = await client.post(url, json=body)
        res.raise_for_status()
        payload = res.json()
    raw_response = payload.get("response", "")
    data = _parse_ollama_json(raw_response)
    result = JobExtractionResult.model_validate(data)
    return result, settings.ollama_model, json.dumps(data)


async def extract_job_data(
    captured_text: str,
    page_title: str,
    source_url: str,
) -> tuple[JobExtractionResult, str, str]:
    if settings.use_mock_extraction:
        result = mock_extract_job_data(captured_text, page_title, source_url)
        return result, "mock-heuristic", json.dumps(result.model_dump())

    try:
        return await ollama_extract_job_data(captured_text)
    except Exception:
        result = mock_extract_job_data(captured_text, page_title, source_url)
        return result, "mock-heuristic-fallback", json.dumps(result.model_dump())
