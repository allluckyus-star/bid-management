/**
 * Local ChatGPT prompt assembly (no backend). User template + JD + optional resume hint.
 */

function normalizePromptText(text) {
  return String(text || "").trim();
}

/**
 * Build the final prompt by substituting the real JD and resume text into the
 * {jd_text} / {resume_text} placeholders inside the locked suffix (not appending).
 * @param {{ template?: string, jdText?: string, resumeText?: string }} opts
 */
function buildLocalChatGptPrompt(opts = {}) {
  const template = normalizePromptText(opts.template || DEFAULT_PROMPT_TEMPLATE);
  const jdText = normalizePromptText(opts.jdText || "") || "(no job description provided)";
  const resumeText = normalizePromptText(opts.resumeText || "") || "(no resume provided)";

  const combined = [template, "", LOCKED_PROMPT_SUFFIX_PREVIEW].join("\n");

  return combined
    .split("{jd_text}")
    .join(jdText)
    .split("{resume_text}")
    .join(resumeText);
}

function promptCharCount(text) {
  return String(text || "").length;
}

function promptSizeWarning(charCount) {
  const max = JBHM_CONFIG.PROMPT_WARN_CHARS ?? 24000;
  if (charCount > max) {
    return `Prompt is large (${charCount.toLocaleString()} chars). Consider trimming the JD section.`;
  }
  if (charCount > max * 0.85) {
    return `Prompt is getting large (${charCount.toLocaleString()} chars).`;
  }
  return "";
}
