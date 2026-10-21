import { trialsOf } from "./variables.ts";
import type { Spec } from "./types.ts";

// jsPsych's recording plugins keep each recording as base64 text in the row's response: a few
// seconds of video is megabytes in one cell of the CSV. A study that uploads its data uploads each
// recording as a file of its own instead, when it saves the rest, and the row names that file;
// saving only then means an ending that keeps nothing sends no recording either. A downloaded file
// has no size limit, so a study that downloads keeps its recordings inside it, in one file.
const RECORDING_PLUGINS = ["html-audio-response", "html-video-response"];

export function usesRecordings(spec: Spec) {
  return trialsOf(spec.timeline).some((trial) => RECORDING_PLUGINS.includes(trial.plugin));
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
      const response = await postToDataPipe(endpoint, { experimentID, filename: name, data: row.response });
      if (response.ok) row.response = name;
    } catch {
      continue;
    }
  }
}
`;
