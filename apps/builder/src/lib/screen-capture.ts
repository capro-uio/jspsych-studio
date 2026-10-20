import captureLibrary from "html-to-image/dist/html-to-image.js?raw";
import { compileSpec, emitHtml, slotsOf, type Spec, type SpecNode } from "@tachisto/compiler";
import { FOCUS_GUARD, tracedPreview } from "./preview.ts";
import { schemas } from "./schemas.ts";
import { segmentHolds, tableAt, type Sequence } from "./sequence.ts";

/** The size the participant's screen is drawn at: the figure's screens, five times over. */
export const CAPTURE_SIZE = { width: 800, height: 500 };

const MESSAGE_SOURCE = "tachisto-capture";

/** Long enough for a slow plugin to draw, short enough that a stuck one does not hold the figure. */
const CAPTURE_TIMEOUT = 20_000;

function onePass(nodes: SpecNode[]) {
  for (const node of nodes) {
    if (node.kind === "block") {
      node.repetitions = 1;
      node.randomize_order = false;
    }
    // Nobody answers during a capture, so a loop repeating until answers are good would not end;
    // no accuracy is below none, so it runs once.
    if (node.kind === "loop")
      node.repeat_while = { scope: node.repeat_while.scope, accuracy_below: 0 };
    if (node.kind === "block" || node.kind === "loop") onePass(node.children);
    for (const slot of slotsOf(node) ?? []) onePass(slot.children);
  }
}

/**
 * The study narrowed to one pass through a sequence's block or loop: every block in it runs one
 * row, once, in order, every loop runs once, and there is no pause between steps. The block's own table runs the row asked for;
 * any other runs its first.
 */
export function captureSpec(spec: Spec, sequence: Sequence, row = 0) {
  const { spec: narrowed, stepIds } = tracedPreview(spec, { from: sequence.path });
  onePass(narrowed.timeline);
  const chosen = tableAt(spec, sequence.path);
  const conditions = Object.fromEntries(
    Object.entries(narrowed.conditions ?? {}).map(([name, rows]) => {
      const pick = name === chosen ? (rows[row] ?? rows[0]) : rows[0];
      return [name, pick ? [pick] : []];
    }),
  );
  const settings = { ...narrowed.settings, default_iti: 0 };
  return { spec: { ...narrowed, conditions, settings }, stepIds };
}

// While a capture runs, no step may end by itself: one that did would leave the next to be
// pictured in its place, and a stimulus timed to disappear would be gone before it was pictured.
// So the study's own timers are held back, before jsPsych loads, and every step ends only once
// it has been pictured. Timers set to fire at once still do, since jsPsych uses them to move on.
const HOLD_TIMERS = `(() => {
  const setTimer = window.setTimeout.bind(window);
  window.tachistoWait = (ms) => new Promise((done) => setTimer(done, ms));
  window.setTimeout = (callback, ms, ...rest) => (ms > 0 ? 0 : setTimer(callback, ms, ...rest));
  window.setInterval = () => 0;
})();`;

// Each step is given a moment to draw and its images time to decode, then pictured, whole page
// and background, as the participant sees it, and ended so the next one starts. A step that has
// ended anyway by then, as one that only runs code does, is left alone.
const SETTLE_MS = 100;

const CAPTURE_SCRIPT = `window.tachistoSteps = 0;
window.tachistoCapture = async (step) => {
  const started = ++window.tachistoSteps;
  await window.tachistoWait(${SETTLE_MS});
  await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
  if (started !== window.tachistoSteps) return;
  let png = null;
  try {
    png = await htmlToImage.toPng(document.body, {
      width: ${CAPTURE_SIZE.width},
      height: ${CAPTURE_SIZE.height},
      backgroundColor: getComputedStyle(document.body).backgroundColor,
    });
  } catch {}
  parent.postMessage({ source: "${MESSAGE_SOURCE}", step, png }, "*");
  if (started === window.tachistoSteps) window.studioExperiment.jsPsych.finishTrial();
};`;

const CAPTURE_HOOKS =
  `on_trial_start: (trial) => { window.tachistoCapture(trial.data?.tachisto_step ?? null); }, ` +
  `on_finish: () => { parent.postMessage({ source: "${MESSAGE_SOURCE}", done: true }, "*"); }`;

export type CaptureMessage =
  { done: true } | { done: false; step: string | null; png: string | null };

// A capture is written straight into the figure's markup, so only a plain base64 PNG is taken.
const PNG_DATA = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;

/** A message from the capture frame, if it is one the capture script sends. */
export function readCaptureMessage(message: unknown): CaptureMessage | null {
  if (typeof message !== "object" || message === null) return null;
  const { source, done, step, png } = message as Record<string, unknown>;
  if (source !== MESSAGE_SOURCE) return null;
  if (done === true) return { done: true };
  if (step !== null && (typeof step !== "string" || !/^\d+(\.\d+)*$/.test(step))) return null;
  if (png !== null && (typeof png !== "string" || !PNG_DATA.test(png))) return null;
  return { done: false, step, png };
}

/** The page that runs one pass through the sequence and pictures each step. */
export async function capturePage(spec: Spec, sequence: Sequence, row = 0) {
  const narrowed = captureSpec(spec, sequence, row);
  const compiled = compileSpec(narrowed.spec, schemas, {
    initEntries: CAPTURE_HOOKS,
    stepIds: narrowed.stepIds,
  });
  const { html } = await emitHtml(compiled, {
    title: spec.name,
    headScripts: [FOCUS_GUARD, HOLD_TIMERS, captureLibrary, CAPTURE_SCRIPT],
  });
  return html;
}

/** Where a picture of a step goes: the segment that holds the step, once, and never a pause. */
export function placeCapture(
  sequence: Sequence,
  screens: (string | undefined)[],
  step: string,
  png: string,
) {
  const index = sequence.segments.findIndex(
    (segment) => segment.role !== "gap" && segmentHolds(segment, step),
  );
  if (index !== -1 && screens[index] === undefined) screens[index] = png;
}

/**
 * A picture of the screen each segment of a sequence starts with, as a participant would see it
 * for one row of its conditions. It runs the steps in a hidden frame sealed off like the preview;
 * a step that cannot be pictured, or does not finish in time, is left without one.
 */
export async function captureScreens(spec: Spec, sequence: Sequence, row = 0) {
  const html = await capturePage(spec, sequence, row);
  const screens: (string | undefined)[] = sequence.segments.map(() => undefined);
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  // Kept inside the window but unseen: a browser stops drawing a frame that is out of view, and a
  // frame that is not drawn cannot be pictured.
  Object.assign(frame.style, {
    position: "fixed",
    left: "0",
    top: "0",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "-1",
    width: `${CAPTURE_SIZE.width}px`,
    height: `${CAPTURE_SIZE.height}px`,
    border: "0",
  });
  const wanted = sequence.segments.filter((segment) => segment.role !== "gap").length;
  try {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, CAPTURE_TIMEOUT);
      const finish = () => {
        clearTimeout(timer);
        window.removeEventListener("message", listen);
        resolve();
      };
      function listen(event: MessageEvent) {
        if (event.source !== frame.contentWindow) return;
        const message = readCaptureMessage(event.data);
        if (!message) return;
        if (message.done) return finish();
        if (message.step && message.png) placeCapture(sequence, screens, message.step, message.png);
        if (screens.filter(Boolean).length >= wanted) finish();
      }
      window.addEventListener("message", listen);
      frame.srcdoc = html;
      document.body.append(frame);
    });
  } finally {
    frame.remove();
  }
  return screens;
}
