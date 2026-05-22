"""Turn extension HTML capture into structured text for extraction."""

from __future__ import annotations

import re
from html.parser import HTMLParser

# UI / nav words that must never be company_name
_INVALID_COMPANY_EXACT = frozenset(
    {
        "apply",
        "apply now",
        "easy apply",
        "submit",
        "search",
        "menu",
        "home",
        "skip to main content",
        "skip to content",
        "main content",
        "share",
        "save",
        "report",
        "linkedin",
        "indeed",
        "glassdoor",
        "careers",
        "jobs",
        "job description",
        "sign in",
        "log in",
        "register",
        "back",
        "next",
        "close",
        "more",
        "less",
        "follow",
        "company",
        "employer",
    }
)

_FORM_LINE = re.compile(
    r"(?:first\s*name|last\s*name|full\s*name|email\s*address|e-?mail|phone\s*number|"
    r"mobile\s*phone|linkedin\s*url|portfolio|cover\s*letter|upload\s*resume|attach\s*resume|"
    r"submit\s*application|how\s*did\s*you\s*hear|work\s*authorization|visa\s*sponsorship|"
    r"desired\s*salary|expected\s*salary|application\s*form|required\s*field|\*\s*required)",
    re.I,
)

_COMPANY_FROM_TEXT = [
    re.compile(
        r"\bAt\s+([A-Z][A-Za-z0-9][A-Za-z0-9&.,'\-\s]{1,58}?)(?:,|\s+we\b|\s+our\b|\s+is\b|\s+are\b|\.)",
        re.I,
    ),
    re.compile(
        r"\b([A-Z][A-Za-z0-9&.\-]{2,50})'s\s+(?:team|mission|culture|product|platform|engineering)",
        re.I,
    ),
    re.compile(r"\bAbout\s+([A-Z][A-Za-z0-9&.\-\s]{2,60})(?:\.|,|\s+is\b|\s+we\b)", re.I),
    re.compile(r"\bJoin\s+([A-Z][A-Za-z0-9&.\-\s]{2,60})\b", re.I),
    re.compile(r"\bWorking\s+at\s+([A-Z][A-Za-z0-9&.\-\s]{2,60})\b", re.I),
]


class _OutlineParser(HTMLParser):
    """Lightweight HTML → structured plain text (no extra dependencies)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._skip_depth = 0
        self._skip_tags = frozenset(
            {
                "script",
                "style",
                "nav",
                "footer",
                "header",
                "form",
                "button",
                "input",
                "select",
                "textarea",
                "noscript",
                "svg",
                "iframe",
                "aside",
            }
        )
        self._block_tags = frozenset(
            {"p", "div", "section", "article", "main", "li", "tr", "br", "h1", "h2", "h3", "h4", "h5", "h6"}
        )
        self._heading = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        t = tag.lower()
        if t in self._skip_tags:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if t in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._heading = t
        elif t == "li":
            self._parts.append("\n- ")
        elif t == "br":
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        t = tag.lower()
        if t in self._skip_tags and self._skip_depth:
            self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if t in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._parts.append("\n")
            self._heading = ""
        elif t in self._block_tags:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        text = re.sub(r"\s+", " ", data).strip()
        if not text:
            return
        if self._heading:
            level = int(self._heading[1])
            prefix = "#" * min(level, 4) + " "
            self._parts.append(f"\n{prefix}{text}\n")
            self._heading = ""
        else:
            self._parts.append(text + " ")

    def get_text(self) -> str:
        raw = "".join(self._parts)
        raw = re.sub(r"[ \t]+\n", "\n", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        return raw.strip()


def html_to_structured_text(html: str) -> str:
    if not html or not html.strip():
        return ""
    parser = _OutlineParser()
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        # Fallback: strip tags
        text = re.sub(r"<[^>]+>", "\n", html)
        text = re.sub(r"\n{2,}", "\n", text)
        return text.strip()
    return parser.get_text()


def is_invalid_company(name: str) -> bool:
    n = re.sub(r"\s+", " ", (name or "").strip())
    if not n or len(n) < 2:
        return True
    low = n.lower()
    if low in _INVALID_COMPANY_EXACT:
        return True
    if len(n.split()) == 1 and low in {"apply", "submit", "search", "menu", "share", "save"}:
        return True
    if re.search(r"\b(skip|click|press|enter|select)\b", low):
        return True
    return False


def infer_company_from_text(text: str) -> str:
    for pat in _COMPANY_FROM_TEXT:
        m = pat.search(text)
        if m:
            candidate = m.group(1).strip().strip(".,'\"")
            if not is_invalid_company(candidate):
                return candidate
    return ""


def drop_form_and_noise_lines(text: str) -> str:
    lines: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if _FORM_LINE.search(line):
            continue
        if line.lower() in _INVALID_COMPANY_EXACT:
            continue
        lines.append(line)
    return "\n".join(lines)


def merge_capture_sources(
    captured_html: str,
    page_title: str,
    source_url: str,
    *,
    legacy_plain_text: str | None = None,
) -> tuple[str, str]:
    """
    Returns (structured_text_for_model, html_excerpt_for_model).
    legacy_plain_text supports jobs captured before HTML-only flow.
    """
    from urllib.parse import urlparse

    structured_parts: list[str] = []
    if page_title.strip():
        structured_parts.append(f"PAGE_TITLE: {page_title.strip()}")
    if source_url.strip():
        structured_parts.append(f"SOURCE_URL: {source_url.strip()}")
        host = urlparse(source_url).hostname or ""
        if host:
            structured_parts.append(f"URL_HOST: {host}")

    html_excerpt = ""
    if captured_html and captured_html.strip():
        html_excerpt = captured_html.strip()[:80000]
        from_html = html_to_structured_text(html_excerpt)
        if from_html:
            structured_parts.append("STRUCTURED_FROM_HTML:\n" + drop_form_and_noise_lines(from_html))

    if legacy_plain_text and legacy_plain_text.strip():
        cleaned = drop_form_and_noise_lines(legacy_plain_text.strip())
        if cleaned:
            structured_parts.append("LEGACY_CAPTURE:\n" + cleaned)

    combined = "\n\n".join(structured_parts).strip()
    return combined[:20000], html_excerpt[:80000]
