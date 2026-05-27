import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prefix = fs.readFileSync(path.join(root, "scripts/resume-prompt-source/prefix.txt"), "utf8");
const suffix = fs.readFileSync(path.join(root, "scripts/resume-prompt-source/suffix.txt"), "utf8");

function jsString(value) {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

const extensionOut = `/** Editable default — verbatim from Resume-sender DEFAULT_PROMPT_TEMPLATE. */
const PROMPT_TEMPLATE_VERSION = 2;

const DEFAULT_PROMPT_TEMPLATE = \`${jsString(prefix)}\`;

/** Server-appended suffix (read-only). Shown in popup below the editable prefix. */
const LOCKED_PROMPT_SUFFIX = \`${jsString(suffix)}\`;

const LOCKED_PROMPT_SUFFIX_PREVIEW = LOCKED_PROMPT_SUFFIX;
`;

const serverOut = `/** Default editable prefix — verbatim from Resume-sender DEFAULT_PROMPT_TEMPLATE. */
export const DEFAULT_PROMPT_PREFIX = \`${jsString(prefix)}\`;

export const LOCKED_PROMPT_SUFFIX = \`${jsString(suffix)}\`;

export type BuildPromptInput = {
  jdText: string;
  resumeText: string;
  companyName: string;
  jobTitle: string;
  userDisplayName: string;
  customPrefix?: string | null;
};

export function buildOptimizationPrompt(input: BuildPromptInput): string {
  const rawPrefix = (input.customPrefix?.trim() || DEFAULT_PROMPT_PREFIX)
    .replace(/{company_name}/g, input.companyName || "")
    .replace(/{job_title}/g, input.jobTitle || "")
    .replace(/{user_name}/g, input.userDisplayName || "");

  const suffix = LOCKED_PROMPT_SUFFIX.replace("{jd_text}", input.jdText.trim()).replace(
    "{resume_text}",
    input.resumeText.trim(),
  );

  return \`\${rawPrefix.trim()}\\n\\n\${suffix.trim()}\`;
}
`;

fs.writeFileSync(path.join(root, "apps/extension/prompt-defaults.js"), extensionOut);
fs.writeFileSync(path.join(root, "apps/web/lib/resumes/prompt-template.ts"), serverOut);
console.log("Synced prompts:", { prefix: prefix.length, suffix: suffix.length });
