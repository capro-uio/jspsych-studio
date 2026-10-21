// Kept apart from the extraction code, which needs Node, so a page can name these files too.

/** Where a jsPsych package's browser build, which defines its global, sits inside the package. */
export const BROWSER_BUNDLE = "dist/index.browser.min.js";

/** jsPsych's own stylesheet, inside the jspsych package. */
export const JSPSYCH_STYLESHEET = "css/jspsych.css";

/**
 * A file's subresource-integrity hash, as a browser checks a script against it. Worked out with
 * Web Crypto, which Node has too, so the hashes recorded at build time and the checks made at
 * download time are one calculation.
 */
export async function integrityOf(bytes: Uint8Array<ArrayBuffer>) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-384", bytes));
  return `sha384-${btoa(String.fromCharCode(...digest))}`;
}

// Text inside an element can end it, or for a script change how the rest is read: a script
// element ends at "</script", and "<!--" or "<script" inside one shift the browser into reading
// it differently; a style element ends at "</style". Rewriting these could change what a file
// does, so a file that holds one is refused instead. Other tags are only text there, such as the
// "</style>" several jsPsych plugins build into their own markup.
const BREAKS_OUT = { script: /<\/script|<script|<!--/i, style: /<\/style/i };

export type Element = keyof typeof BREAKS_OUT;

/** What in a file would break out of the element it is written into, if anything. */
export function breaksOut(text: string, element: Element) {
  return BREAKS_OUT[element].exec(text)?.[0] ?? null;
}

/** The element a page writes a file into: a script or a stylesheet; null for anything else. */
export function elementFor(path: string): Element | null {
  if (path.endsWith(".js")) return "script";
  return path.endsWith(".css") ? "style" : null;
}
