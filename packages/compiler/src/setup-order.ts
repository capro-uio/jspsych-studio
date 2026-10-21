import { slotsOf, trialsOf } from "./variables.ts";
import type { Spec, SpecNode, TrialNode } from "./types.ts";
import type { Problem } from "./validate.ts";

interface SetUpStep {
  plugin: string;
  title: string;
}

const MICROPHONE = { plugin: "initialize-microphone", title: "Set up the microphone" };
const CAMERA = { plugin: "initialize-camera", title: "Set up the camera" };
const EYE_TRACKER_SETUP = { plugin: "webgazer-init-camera", title: "Set up eye tracking" };
const CALIBRATION = { plugin: "webgazer-calibrate", title: "Calibrate eye tracking" };

// Each needs steps that come first, or it finds no recorder, no eye tracker, or an eye tracker
// that has not learnt where the participant looks, whose accuracy means nothing.
const SET_UP_BY: Record<string, SetUpStep[]> = {
  "html-audio-response": [MICROPHONE],
  "html-video-response": [CAMERA],
  "mirror-camera": [CAMERA],
  "webgazer-calibrate": [EYE_TRACKER_SETUP],
  "webgazer-validate": [EYE_TRACKER_SETUP, CALIBRATION],
};

const DEVICE_PLUGINS = new Set([
  ...Object.keys(SET_UP_BY),
  ...Object.values(SET_UP_BY).flatMap((steps) => steps.map((setUp) => setUp.plugin)),
]);

const EYE_TRACKING_STEPS = new Set([
  EYE_TRACKER_SETUP.plugin,
  CALIBRATION.plugin,
  "webgazer-validate",
]);

/** The steps that start, calibrate and check the eye tracker, rather than use it. */
export function isEyeTrackingStep(plugin: string) {
  return EYE_TRACKING_STEPS.has(plugin);
}

// What a step needs set up first, and why, for saying so when it is not.
function needsOf(trial: TrialNode) {
  const needs = (SET_UP_BY[trial.plugin] ?? []).map((step) => ({ step, why: "needs" }));
  return trial.gaze ? [...needs, { step: CALIBRATION, why: "tracks gaze, so it needs" }] : needs;
}

/** Whether any step uses the participant's camera or microphone, as eye tracking does too. */
export function usesDevices(spec: Spec) {
  return trialsOf(spec.timeline).some((trial) => DEVICE_PLUGINS.has(trial.plugin));
}

const DEVICE_FEATURES = ["webcam", "microphone"];

// The browser check records every feature unless told which, and a list read from a column or
// computed may hold either device.
function checksForDevices(trial: TrialNode) {
  const features = trial.params?.features;
  return (
    features === undefined ||
    !Array.isArray(features) ||
    features.some((feature) => DEVICE_FEATURES.includes(String(feature)))
  );
}

/** Whether a browser check looks for a camera or microphone, which a frame without either lacks. */
export function checksDevices(spec: Spec) {
  return trialsOf(spec.timeline).some(
    (trial) => trial.plugin === "browser-check" && checksForDevices(trial),
  );
}

function intersection(sets: Set<string>[]) {
  return new Set([...sets[0]].filter((step) => sets.every((set) => set.has(step))));
}

// What is certainly set up after a list of steps, given what was before them. Only one path of a
// branch runs, and only one group of a split, so after either only what every path set up counts;
// counterbalanced tasks run in any order, so within one only what came before them counts.
function setUpAfter(nodes: SpecNode[], before: Set<string>, path: number[], problems: Problem[]) {
  let ready = new Set(before);
  nodes.forEach((node, index) => {
    const here = [...path, index];
    if (node.kind === "trial") {
      for (const { step, why } of needsOf(node)) {
        if (ready.has(step.plugin)) continue;
        problems.push({
          message: `plugin "${node.plugin}" ${why} a "${step.title}" step (${step.plugin}) that every participant reaches before it`,
          path: here,
          severity: "error",
        });
      }
      ready.add(node.plugin);
    } else if (node.kind === "block" || node.kind === "loop") {
      ready = setUpAfter(node.children, ready, here, problems);
    } else if (node.kind === "counterbalance") {
      const tasks = node.tasks.map((task, slot) =>
        setUpAfter(task.children, ready, [...here, slot], problems),
      );
      ready = new Set([ready, ...tasks].flatMap((set) => [...set]));
    } else {
      const paths = (slotsOf(node) ?? []).map((slot, slotIndex) =>
        setUpAfter(slot.children, ready, [...here, slotIndex], problems),
      );
      if (paths.length > 0) ready = intersection(paths);
    }
  });
  return ready;
}

/** Steps that some participants reach before the step that sets up what they use. */
export function setupOrderProblems(spec: Spec) {
  const problems: Problem[] = [];
  setUpAfter(spec.timeline, new Set(), [], problems);
  return problems;
}
