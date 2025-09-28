/// <reference types="@remix-run/node" />
/// <reference types="@remix-run/react" />
/// <reference types="@remix-run/serve" />

declare namespace NodeJS {
  interface ProcessEnv {
    LISTEN_NOTES_API_KEY?: string;
    GEMINI_API_KEY?: string;
  }
}

declare module "*.css?url" {
  const href: string;
  export default href;
}
