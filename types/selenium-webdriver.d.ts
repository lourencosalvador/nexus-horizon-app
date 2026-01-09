declare module "selenium-webdriver" {
  // Project only uses Selenium in a server route and doesn't rely on its TS typings.
  // Keep this minimal to unblock Next.js production builds.
  export type WebDriver = any;
  export const Builder: any;
  export const By: any;
  export const until: any;
}

declare module "selenium-webdriver/chrome" {
  const chrome: any;
  export default chrome;
}


