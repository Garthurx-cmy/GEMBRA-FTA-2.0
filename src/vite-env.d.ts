/// <reference types="vite/client" />

declare module "*?inline" {
  const content: string;
  export default content;
}

declare module "heic2any";

declare const __APP_BUILD_VERSION__: string;
