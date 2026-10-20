import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import tokens from "../tokens.json" with { type: "json" };

/** The size Open Graph and X both crop to without losing the edges. */
export const CARD_SIZE = { width: 1200, height: 630 };

export const CARD_PATH = join(import.meta.dirname, "..", "logos", "tachisto-social-card.png");

const LIGHT_INKS = new Map(tokens.color.tokens.map((token) => [token.name, token.value.light]));

function light(name: string) {
  const colour = LIGHT_INKS.get(name);
  if (!colour) throw new Error(`no brand colour named ${name}`);
  return colour;
}

function fontFace(family: string, file: string, weight: number) {
  const bytes = readFileSync(fileURLToPath(import.meta.resolve(file)));
  return `@font-face { font-family: "${family}"; font-weight: ${weight}; src: url(data:font/woff2;base64,${bytes.toString("base64")}) format("woff2"); }`;
}

/**
 * The card a link to the website unfurls into: the wordmark, the promise, and the hero's trial
 * laid out on its track, in the light inks, with the fonts embedded so it renders the same anywhere.
 */
export function socialCardHtml() {
  const wordmark = readFileSync(
    join(import.meta.dirname, "..", "logos", "tachisto-wordmark.svg"),
    "utf8",
  );
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
${fontFace("Jost", "@fontsource/jost/files/jost-latin-500-normal.woff2", 500)}
${fontFace("Atkinson Hyperlegible", "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2", 400)}
${fontFace("Atkinson Hyperlegible", "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2", 700)}
${fontFace("IBM Plex Mono", "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2", 500)}
* { box-sizing: border-box; margin: 0; }
body {
  width: ${CARD_SIZE.width}px; height: ${CARD_SIZE.height}px;
  padding: 64px 72px;
  display: flex; flex-direction: column; justify-content: space-between;
  background: ${light("paper")}; color: ${light("ink")};
  font-family: "Atkinson Hyperlegible", sans-serif;
}
.wordmark svg { height: 64px; width: auto; display: block; }
h1 { font-family: "Jost", sans-serif; font-weight: 500; font-size: 68px; line-height: 1.08; letter-spacing: -0.01em; max-width: 960px; }
.lede { margin-top: 20px; font-size: 28px; color: ${light("ink-muted")}; }
.track { display: flex; gap: 6px; padding: 14px; background: ${light("paper-sunk")}; border-radius: 6px; }
.block { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.name { height: 52px; display: flex; align-items: center; gap: 10px; padding: 0 14px; border-radius: 3px; font-weight: 700; font-size: 22px; }
.timing { font-family: "IBM Plex Mono", monospace; font-weight: 500; font-size: 18px; color: ${light("ink-muted")}; padding-left: 2px; }
.fixation .name { background: ${light("paper-raised")}; }
.stimulus .name { background: ${light("stimulus-fill")}; color: ${light("on-stimulus")}; }
.mask .name { background: ${light("mask")}; }
.response .name { background: ${light("paper-raised")}; border: 2px dashed ${light("line-strong")}; }
.cross { position: relative; width: 14px; height: 14px; flex: none; }
.cross::before, .cross::after { content: ""; position: absolute; background: currentColor; }
.cross::before { left: 6px; width: 2px; height: 14px; }
.cross::after { top: 6px; height: 2px; width: 14px; }
</style>
</head>
<body>
<div>
  <div class="wordmark">${wordmark}</div>
</div>
<div>
  <h1>Build jsPsych experiments without writing code.</h1>
  <p class="lede">Free and open source. Runs in your browser.</p>
</div>
<div class="track">
  <div class="block fixation" style="flex: 5 1 0"><span class="name"><span class="cross"></span>Fixation</span><span class="timing">500 ms</span></div>
  <div class="block stimulus" style="flex: 8 1 0"><span class="name">Stimulus</span><span class="timing">800 ms</span></div>
  <div class="block mask" style="flex: 3 1 0"><span class="name">Mask</span><span class="timing">300 ms</span></div>
  <div class="block response" style="flex: 6 1 0"><span class="name">Until response</span><span class="timing">f or j</span></div>
</div>
</body>
</html>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: CARD_SIZE });
  await page.setContent(socialCardHtml());
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: CARD_PATH });
  await browser.close();
  console.log(`social card -> ${CARD_PATH}`);
}
