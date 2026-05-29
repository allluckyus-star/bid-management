/**
 * Groq defaults (committed). Real keys go in groq-keys.local.js (gitignored).
 * @type {string[]}
 */
var GROQ_KEY_POOL = [];

/** @type {string} */
var GROQ_DEFAULT_MODEL = "llama-3.1-8b-instant"; // fallback if JBHM_CONFIG unavailable in service worker
