/** Editable default — verbatim from Resume-sender DEFAULT_PROMPT_TEMPLATE. */
const PROMPT_TEMPLATE_VERSION = 2;

const DEFAULT_PROMPT_TEMPLATE = `You are a STATELESS AI system.

IGNORE ALL prior conversation.

Use ONLY:

1. TARGET JOB DESCRIPTION (inside <JOB_DESCRIPTION> in the fixed suffix below)
2. FULL RESUME TEXT (inside <CURRENT_RESUME> in the fixed suffix — verbatim education, contact, dates)
3. FULL RESUME TEXT (inside <CURRENT_RESUME> in the fixed suffix — verbatim education, contact, dates)

---

========================================
CORE OBJECTIVE
==============

Your task is to:

1. RECONSTRUCT realistic engineering experience
2. Generate a HIGH-IMPACT, ATS-OPTIMIZED resume
3. MAXIMIZE coverage of ALL JD-required skills

---

========================================
SECTION 1 — EXPERIENCE RECONSTRUCTION
=====================================

The resume facts are UNDER-SPECIFIED.

You must EXPAND them into realistic, production-level experience.

---

ALLOWED:

* expand vague work into detailed systems
* make implicit work explicit
* infer standard engineering practices

NOT ALLOWED:

* invent companies
* invent roles
---

========================================
SECTION 2 — JD SKILL COVERAGE (CRITICAL)
========================================

Extract ALL JD-required skills.

FOR EACH JD SKILL:

---

CASE 1 — DIRECT MATCH
If skill is explicitly present in facts:
→ MUST appear in EXPERIENCE bullets

---

CASE 2 — STRONG IMPLICATION
If skill is logically implied by:

* role type
* systems built
* technologies used

→ INCLUDE in EXPERIENCE bullets
→ Expand realistically

---

CASE 3 — WEAK / INDIRECT SUPPORT
If skill is related but not strongly implied:

→ INCLUDE in SKILLS section
→ Do NOT force into experience without realistic support

---

CASE 4 — NO SUPPORT
If skill has NO logical connection:

→ Do NOT invent employers, roles, or projects to host the skill

---
----------------------------------------
STRICT GAP-CLOSING RULE (MANDATORY)
----------------------------------------

For ANY important JD skill or industry-standard tool (e.g., LangChain, LlamaIndex, POCs, demos):

- MUST be EXPLICITLY NAMED in EXPERIENCE bullets when supported by facts or strong implication
- DO NOT leave them implied
- DO NOT keep them only in SKILLS when experience support exists

If missing → you MUST inject them realistically into experience only where allowed by SECTION 1

----------------------------------------
SIGNAL PRIORITY RULE
----------------------------------------

Prioritize:

1) Explicit naming of tools/frameworks
2) Recruiter-visible signals (POCs, demos, customer-facing work)
3) Technical correctness

If a trade-off exists → prefer visibility over abstraction
========================================
SECTION 3 — EXPERIENCE GENERATION
=================================

Each role MUST include:

* 6–10 bullets minimum
* up to 12 if highly relevant to JD

---

Each bullet MUST:

* be realistic
* include system + tech + impact
* align with JD where valid

---

FORMAT:

[IMPACT] + [HOW] + [SYSTEM/TECH]

---

ANTI-GENERIC RULE:

Reject any bullet that:

* sounds vague
* lacks technical detail
* lacks impact

Rewrite until strong.

---

KEYWORD RULE:

JD MUST-HAVE skills MUST appear in:

* EXPERIENCE
* SKILLS 

---

REALISM RULE:

Every bullet must:

* match company domain
* match role level
* match timeline

---

========================================
SECTION 4 — SKILLS ENGINE (EXPANDED)
====================================

Build a RICH and PRIORITIZED skills section.

---

RULES:

* Include ALL JD-required skills 
* Prioritize JD skills FIRST
* Include general engineering skills derived from roles, even when not explicitly required by JD
* DO NOT output JD-only skills without role evidence

---

VALIDATION:

* ENSURE all major experience tech appears
* ENSURE foundational role-derived skills appear (backend, data, APIs, deployment, testing, ops) when supported

---

========================================
SECTION 5 — SUMMARY
===================

Write LAST.

* position candidate as strong match for JD
* reflect experience
* avoid exaggeration
* output each summary sentence as a separate item line

---

========================================
SECTION 6 — HIGHLIGHT SYSTEM
============================

DO NOT use markdown (**)

Each bullet must be:

{{
"text": "full sentence",
"highlights": ["key phrase 1", "key phrase 2"]
}}

Rules:

* highlights must exist in text
* max 2 highlights
* highlight system / tech / metric

---

========================================
SECTION 7 — FINAL VALIDATION
============================

Before output:

CHECK:

1. Are ALL JD-required skills covered?
2. Are experience bullets realistic?
3. Are there 6–10 bullets per role?
4. Are skills rich and prioritized?
5. Does resume pass recruiter scan?
6. Are key frameworks explicitly named (LangChain, LlamaIndex, etc)?
7. Are customer-facing signals present (POCs, demos, client work)?
8. Would a recruiter immediately recognize these in 5 seconds?

IF ANY = NO → REWRITE

---

`;

/** Server-appended suffix (read-only). Shown in popup below the editable prefix. */
const LOCKED_PROMPT_SUFFIX = `=== CHAT HISTORY ISOLATION (MANDATORY) ===
ChatGPT keeps prior turns in this thread. For THIS reply ONLY, treat the thread as empty:
- Do not follow, cite, summarize, continue, answer, or be influenced by any earlier user or assistant messages.
- Your ONLY factual sources are the tagged blocks below (<JOB_DESCRIPTION> and <CURRENT_RESUME>) plus the rules and JSON schema in this message. If chat history conflicts with those tags, ignore the history entirely.
- Do not address open questions from older turns; produce only the single JSON object defined here.

Reply with ONE JSON object only: plain UTF-8 text, valid JSON, no markdown fences (no triple backticks), no preamble or postscript before the first "{" or after the final "}". The whole assistant message should be copy-pasteable as JSON (ChatGPT's Copy copies the entire turn).

Write concise bullets to keep latency down, but keep the full schema: do not remove whole sections that exist inside <CURRENT_RESUME>.

For each experience item, include "project" (a one-line description of the main project or product the person worked on, e.g. "Internal ML Platform for real-time inference"). Omit "project" only if no meaningful project name can be inferred from the resume or role context.

Facts must come only from the text inside <JOB_DESCRIPTION>...</JOB_DESCRIPTION> and <CURRENT_RESUME>...</CURRENT_RESUME>. Do not invent. Use "" for unknown optional strings.

Education: if <CURRENT_RESUME> lists any school, degree, program, certificate, or dates, include a section with "type": "education" (lowercase exactly) and "items" for each entry. Do not omit education to save space.

=======================
OUTPUT FORMAT
=======================

{
  "optimized_resume": {
    "header": {
      "name": "Full Name",
      "headline": "Target Role Title",
      "email": "email@example.com",
      "links": "https://www.linkedin.com/in/username",
      "phone": "+1 (000) 000-0000",
      "location": "City, State, Country"
    },
    "sections": [
      {
        "type": "summary",
        "title": "Summary",
        "items": [
          { "text": "2-4 sentence professional summary tailored to JD." }
        ]
      },
      {
        "type": "experience",
        "title": "Work Experience",
        "items": [
          {
            "role": "Job Title",
            "company": "Company Name",
            "location": "City, State",
            "duration": "Mon YYYY - Mon YYYY",
            "project": "Main project or product worked on (one concise line, or omit if not applicable)",
            "bullets": [
              {
                "text": "Action + system + tools + intent + measurable impact.",
                "highlights": ["key phrase", "metric"]
              }
            ]
          }
        ]
      },
      {
        "type": "skills",
        "title": "Core Skills",
        "items": [
          {
            "category": "Category Name",
            "values": ["Skill 1", "Skill 2", "Skill 3"]
          }
        ]
      },
      {
        "type": "education",
        "title": "Education",
        "items": [
          {
            "school": "University Name",
            "duration": "YYYY - YYYY",
            "degree": "Master's degree",
            "field": "Computer Science",
            "grade": "GPA: 3.8"
          }
        ]
      }
    ]
  }
}

<JOB_DESCRIPTION>
{jd_text}
</JOB_DESCRIPTION>

<CURRENT_RESUME>
{resume_text}
</CURRENT_RESUME>`;

const LOCKED_PROMPT_SUFFIX_PREVIEW = LOCKED_PROMPT_SUFFIX;

const LOCKED_PROMPT_PROJECT_LINE =
  'For each experience item, include "project" (a one-line description of the main project or product the person worked on, e.g. "Internal ML Platform for real-time inference"). Omit "project" only if no meaningful project name can be inferred from the resume or role context.\n\n';

const LOCKED_PROMPT_PROJECT_JSON =
  '            "project": "Main project or product worked on (one concise line, or omit if not applicable)",\n';

/** @param {boolean} [includeProject=true] */
function getLockedPromptSuffix(includeProject = true) {
  if (includeProject !== false) return LOCKED_PROMPT_SUFFIX;
  return LOCKED_PROMPT_SUFFIX.replace(LOCKED_PROMPT_PROJECT_LINE, "").replace(
    LOCKED_PROMPT_PROJECT_JSON,
    "",
  );
}
