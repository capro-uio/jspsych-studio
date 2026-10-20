import { literal } from "./emit.ts";
import { extensionIdentifier } from "./identifiers.ts";
import { isEyeTrackingStep } from "./setup-order.ts";
import { trialsOf } from "./variables.ts";
import type { Spec, TrialNode } from "./types.ts";

/** The extension, as the schema bundle names it, that runs the eye tracker. */
export const EYE_TRACKER = "webgazer";
const EYE_TRACKER_CLASS = "LiveWebgazerExtension";

/** The attribute a page's extra scripts carry, naming their package, so files beside one can be found. */
export const PACKAGE_ATTRIBUTE = "data-package";

/** Whether the study runs the eye tracker, to set it up or to track gaze with it. */
export function usesEyeTracking(spec: Spec) {
  return trialsOf(spec.timeline).some(
    (trial) => trial.gaze !== undefined || isEyeTrackingStep(trial.plugin),
  );
}

export function tracksGaze(spec: Spec) {
  return trialsOf(spec.timeline).some((trial) => trial.gaze !== undefined);
}

// The eye-tracking steps cannot record gaze while they are teaching or checking the eye tracker.
export function gazeProblems(trial: TrialNode) {
  if (!trial.gaze) return [];
  if (isEyeTrackingStep(trial.plugin)) {
    return ["runs the eye tracker itself, so it cannot also track gaze (gaze)"];
  }
  const blank = (trial.gaze.targets ?? []).some((target) => target.trim() === "");
  return blank ? ["names a blank element to record the place of (gaze.targets)"] : [];
}

// The extension samples by asking a paused WebGazer for a fresh estimate, which reads the eyes
// from the last frame WebGazer painted, at the end of calibration, and comes without the time it
// was made. Here WebGazer runs while it samples, estimating once a frame, and the extension takes
// those estimates as they come, as often as it would have sampled, stamped with the time.
// The extension also looks every target up on each change to the screen and stops at the first
// the browser cannot read, so such a selector is left out rather than losing the ones after it.
const EYE_TRACKER_DEFINITION = `class ${EYE_TRACKER_CLASS} extends ${extensionIdentifier(EYE_TRACKER)} {
  constructor(jsPsych) {
    super(jsPsych);
    const start = this.on_start;
    this.on_start = (params) =>
      start({ ...params, targets: params.targets.filter((selector) => {
        try {
          document.createDocumentFragment().querySelector(selector);
          return true;
        } catch {
          console.warn("Not recording where " + selector + " is: it is not a CSS selector.");
          return false;
        }
      }) });
    this.startSampleInterval = (interval = this.sampling_interval) => {
      let sampled = -Infinity;
      this.webgazer.setGazeListener((gaze) => {
        const now = performance.now();
        if (now - sampled < interval) return;
        sampled = now;
        this.handleGazeDataUpdate(gaze && { x: gaze.x, y: gaze.y, t: now });
      });
      this.resume();
    };
    this.stopSampleInterval = () => {
      this.webgazer.clearGazeListener();
      this.pause();
    };
  }
}`;

/** The entry `initJsPsych` takes to start the eye tracker. */
export const EYE_TRACKER_SETTING = `extensions: [{ type: ${EYE_TRACKER_CLASS} }]`;

// The extension reads the targets without checking they are there, so a step tracked without any
// is given an empty list rather than none. It records each under its selector, so one named twice
// is named once.
export function gazeExtension(trial: TrialNode) {
  if (!trial.gaze) return null;
  const targets = literal([...new Set(trial.gaze.targets ?? [])]);
  return `[{ type: ${EYE_TRACKER_CLASS}, params: { targets: ${targets} } }]`;
}

// WebGazer loads its face model from beside the page unless told otherwise, and the page is not
// where WebGazer is, so it is pointed at the folder beside its own script. It would also keep what
// it learns, images of the eyes included, in the browser for the next visit, which on a shared lab
// computer is the next participant. Without WebGazer there is nothing to set, and the extension
// says so when jsPsych starts it.
export function eyeTrackerSetup(webgazerPackage: string) {
  const script = literal(`script[${PACKAGE_ATTRIBUTE}="${webgazerPackage}"]`);
  return `if (window.webgazer) {
  webgazer.params.faceMeshSolutionPath = new URL(
    "mediapipe/face_mesh",
    document.querySelector(${script}).src,
  ).href;
  webgazer.saveDataAcrossSessions(false);
}

${EYE_TRACKER_DEFINITION}`;
}
