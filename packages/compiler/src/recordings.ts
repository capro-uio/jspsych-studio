import { slotsOf } from "./variables.ts";
import type { Spec, SpecNode, TrialNode } from "./types.ts";

// jsPsych's recording plugins keep each recording as base64 text in the row's response: a few
// seconds of video is megabytes in one cell of the CSV. A study that uploads its data uploads each
// recording as a file of its own instead, when it saves the rest, and the row names that file;
// saving only then means an ending that keeps nothing sends no recording either. A downloaded file
// has no size limit, so a study that downloads keeps its recordings inside it, in one file.
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

type Problems = { message: string; path: number[] }[];

function intersection(sets: Set<string>[]) {
  return new Set([...sets[0]].filter((device) => sets.every((set) => set.has(device))));
}

// What is certainly set up after a list of steps, given what was before them. Only one path of a
// branch runs, and only one group of a split, so after either only what every path set up counts;
// counterbalanced tasks run in any order, so within one only what came before them counts.
function setUpAfter(nodes: SpecNode[], before: Set<string>, path: number[], problems: Problems) {
  let ready = new Set(before);
  nodes.forEach((node, index) => {
    const here = [...path, index];
    if (node.kind === "trial") {
      const needs = SET_UP_BY[node.plugin];
      if (needs && !ready.has(needs.plugin)) {
        problems.push({
          message: `plugin "${node.plugin}" needs a "${needs.title}" step (${needs.plugin}) that every participant reaches before it`,
          path: here,
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

/** Steps that use a camera or microphone that some participants reach without it set up. */
export function recordingOrderProblems(spec: Spec) {
  const problems: Problems = [];
  setUpAfter(spec.timeline, new Set(), [], problems);
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
  const extension = head.startsWith("\\x1aE\\xdf\\xa3")
    ? "webm"
    : head.includes("ftyp")
      ? "mp4"
      : head.startsWith("OggS")
        ? "ogg"
        : "bin";
  return filename.replace(/\\.csv$/, "") + "_trial" + row.trial_index + "." + extension;
};
// A recording that cannot be uploaded, as when the experiment has no base64 data switched on,
// stays inside the data as it was, so the rest still goes up and nothing is lost.
async function uploadRecordings(rows, filename, endpoint, experimentID) {
  const recordings = recordingRows(rows);
  for (const [index, row] of recordings.entries()) {
    jsPsych.getDisplayElement().innerHTML =
      "<p>Saving recording " + (index + 1) + " of " + recordings.length + ", please do not close this window.</p>";
    const name = recordingName(filename, row);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentID, filename: name, data: row.response }),
      });
      if (response.ok) row.response = name;
    } catch {
      continue;
    }
  }
}
`;
