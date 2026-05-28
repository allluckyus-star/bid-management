/**
 * Local ChatGPT prompt assembly (no backend). User template + JD + optional resume hint.
 */

function normalizePromptText(text) {
  return String(text || "").trim();
}

/**
 * @param {{ template?: string, jdText?: string, jobTitle?: string, company?: string, resumeLabel?: string, username?: string }} opts
 */
function buildLocalChatGptPrompt(opts = {}) {
  const template = normalizePromptText(opts.template || DEFAULT_PROMPT_TEMPLATE);
  const jdText = normalizePromptText(opts.jdText || "");
  const jobTitle = normalizePromptText(opts.jobTitle || "");
  const company = normalizePromptText(opts.company || "");
  const resumeLabel = normalizePromptText(opts.resumeLabel || "your default resume");
  const username = normalizePromptText(opts.username || "");

  const header = [
    template,
    "",
    "---",
    "TARGET JOB (reviewed in extension)",
    jobTitle ? `Job title: ${jobTitle}` : "",
    company ? `Company: ${company}` : "",
    username ? `Bidder: ${username}` : "",
    `Resume to optimize: ${resumeLabel}`,
    "",
    "<JOB_DESCRIPTION>",
    jdText || "(paste or capture JD text in the Capture tab)",
    "</JOB_DESCRIPTION>",
    "",
    LOCKED_PROMPT_SUFFIX_PREVIEW,
  ]
    .filter(Boolean)
    .join("\n");

  return header;
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
