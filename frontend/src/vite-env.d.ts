/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Public API origin. Leave unset to call same-origin `/api` (recommended). Never put secrets here. */
  readonly VITE_API_URL?: string;
}
