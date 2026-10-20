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
