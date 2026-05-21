/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_JBHM_CLIENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
