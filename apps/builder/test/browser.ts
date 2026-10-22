import { chromium, webkit } from "playwright";

/**
 * The browser an end-to-end suite runs in: Chrome, or the channel `PLAYWRIGHT_CHANNEL` names, or
 * WebKit, Safari's engine, when `PLAYWRIGHT_BROWSER` is `webkit`.
 */
export function launchBrowser() {
  if (process.env.PLAYWRIGHT_BROWSER === "webkit") return webkit.launch();
  return chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" });
}
