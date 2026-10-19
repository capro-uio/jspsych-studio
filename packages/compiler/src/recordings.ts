import { slotsOf } from "./variables.ts";
import type { Spec, SpecNode, TrialNode } from "./types.ts";

// jsPsych's recording plugins keep each recording as base64 text in the row's response: a few
// seconds of video is megabytes in one cell of the CSV. A study that saves its data saves each
// recording as a file of its own instead, when it saves the rest, and the row names that file;
// saving only then means an ending that keeps nothing sends no recording either.
const RECORDING_PLUGINS = ["html-audio-response", "html-video-response"];

// Each needs its device set up by a step that comes first, or the plugin finds no recorder.
const SET_UP_BY: Record<string, { plugin: string; title: string }> = {
  "html-audio-response": { plugin: "initialize-microphone", title: "Set up the microphone" },
  "html-video-response": { plugin: "initialize-camera", title: "Set up the camera" },
  "mirror-camera": { plugin: "initialize-camera", title: "Set up the camera" },
};

function trialsInOrder(nodes: SpecNode[], path: number[] = []): [TrialNode, number[]][] {
  return nodes.flatMap((node, index): [TrialNode, number[]][] => {
    const here = [...path, index];
    if (node.kind === "trial") return [[node, here]];
    if (node.kind === "block" || node.kind === "loop") return trialsInOrder(node.children, here);
    return (slotsOf(node) ?? []).flatMap((slot, slotIndex) =>
      trialsInOrder(slot.children, [...here, slotIndex]),
    );
  });
}

/** Whether any step uses the participant's camera or microphone. */
export function usesDevices(spec: Spec) {
  const devicePlugins = new Set([
    ...Object.keys(SET_UP_BY),
    ...Object.values(SET_UP_BY).map((setUp) => setUp.plugin),
  ]);
  return trialsInOrder(spec.timeline).some(([trial]) => devicePlugins.has(trial.plugin));
}

export function usesRecordings(spec: Spec) {
  return trialsInOrder(spec.timeline).some(([trial]) => RECORDING_PLUGINS.includes(trial.plugin));
}

/** Steps that use a camera or microphone no earlier step has set up. */
export function recordingOrderProblems(spec: Spec) {
  const seen = new Set<string>();
  const problems: { message: string; path: number[] }[] = [];
  for (const [trial, path] of trialsInOrder(spec.timeline)) {
    const needs = SET_UP_BY[trial.plugin];
    if (needs && !seen.has(needs.plugin)) {
      problems.push({
        message: `plugin "${trial.plugin}" needs a "${needs.title}" step (${needs.plugin}) before it`,
        path,
      });
    }
    seen.add(trial.plugin);
  }
  return problems;
}

// The file type is read from the recording's first bytes: WebM, as Chrome and Firefox record, or
// MP4, as Safari does.
export const RECORDING_HELPERS = `const recordingPlugins = new Set(${JSON.stringify(RECORDING_PLUGINS)});
const recordingRows = (rows) =>
  rows
    .values()
    .filter(
      (row) =>
        recordingPlugins.has(row.trial_type) &&
        typeof row.response === "string" &&
        row.response !== "" &&
        !row.response.includes("."),
    );
const recordingName = (filename, row) => {
  const head = atob(row.response.slice(0, 16));
  const extension = head.startsWith("\\x1aE\\xdf\\xa3") ? "webm" : head.includes("ftyp") ? "mp4" : "bin";
  return filename.replace(/\\.csv$/, "") + "_trial" + row.trial_index + "." + extension;
};
async function uploadRecordings(rows, filename, endpoint, experimentID) {
  for (const row of recordingRows(rows)) {
    const name = recordingName(filename, row);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentID, filename: name, data: row.response }),
    });
    if (!response.ok) throw new Error("the server responded with " + response.status);
    row.response = name;
  }
}
function downloadRecordings(rows, filename) {
  for (const row of recordingRows(rows)) {
    const name = recordingName(filename, row);
    const bytes = Uint8Array.from(atob(row.response), (character) => character.charCodeAt(0));
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([bytes]));
    link.download = name;
    link.click();
    row.response = name;
  }
}
`;
