/// <reference types="@remix-run/node" />
/// <reference types="@remix-run/react" />
/// <reference types="@remix-run/serve" />

declare namespace NodeJS {
  interface ProcessEnv {
    GEMINI_API_KEY?: string;
    PODCHASER_API_KEY?: string;
    PODCHASER_API_SECRET?: string;
  }
}

declare module "*.css?url" {
  const href: string;
  export default href;
}
