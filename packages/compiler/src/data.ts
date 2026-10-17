import { literal } from "./emit.ts";
import { PARTICIPANT_PLACEHOLDER } from "./recruitment.ts";
import type { DataSettings, Ending } from "./types.ts";

export const DATAPIPE_URL = "https://pipe.jspsych.org";

// Bound once, before the timeline runs, so the filename and the return address never depend on a
// trial having written a row first.
const PARTICIPANT_ID = "participantId";

export const CALL_FUNCTION_PLUGIN = "call-function";

function savingScreen(message: string) {
  return `jsPsych.getDisplayElement().innerHTML = ${literal(`<p>${message}</p>`)};`;
}

function urlExpression(template: string) {
  const pieces = template
    .split(PARTICIPANT_PLACEHOLDER)
    .flatMap((text, index) => [
      ...(index > 0 ? [`encodeURIComponent(${PARTICIPANT_ID})`] : []),
      ...(text ? [literal(text)] : []),
    ]);
  return pieces.join(" + ");
}

const UPLOAD_FAILED =
  "<p>Your data could not be uploaded, so it has been downloaded to this computer " +
  "instead. Please send the file to the researcher.</p>";

// abortExperiment leaves its message on screen; ending the trial normally would clear it.
function showMessage(message: string) {
  return `jsPsych.abortExperiment(${literal(message)});`;
}

/** How the upload step ends: with the participant staying, or being sent back to a platform. */
function uploadEnding(ending: Ending | undefined) {
  if (ending?.message) {
    return {
      declaration: "",
      saved: "",
      failed: literal(UPLOAD_FAILED + ending.message),
      finish: showMessage(ending.message),
    };
  }
  if (!ending?.url) {
    return {
      declaration: "",
      saved: savingScreen("Your data has been saved. Thank you!"),
      failed: literal(UPLOAD_FAILED),
      finish: "done();",
    };
  }
  const href = `completionUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;")`;
  return {
    declaration: `const completionUrl = ${urlExpression(ending.url)};`,
    saved: savingScreen("Your data has been saved. Taking you back to finish the study."),
    failed:
      `${literal(`${UPLOAD_FAILED}<p>Once you have the file, <a href="`)} + ${href} + ` +
      literal(`">continue here to finish the study</a>.</p>`),
    // The page is leaving, so the trial is not ended: that would clear the message first.
    finish: "window.location.assign(completionUrl);",
  };
}

// Losing a participant's data because an upload failed is unrecoverable, so a failed upload falls
// back to a download rather than ending the experiment as if the data had been stored.
function uploadStep(settings: DataSettings, filename: string, studyEnding: Ending | undefined) {
  const endpoint = `${(settings.endpoint ?? DATAPIPE_URL).replace(/\/+$/, "")}/api/data/`;
  const ending = uploadEnding(studyEnding);
  // jsPsych ends an async call-function trial when `done` is called, not when the promise settles.
  return `async (done) => {
    ${savingScreen("Saving your data, please do not close this window.")}
    const filename = ${filename};
    ${ending.declaration}
    try {
      const response = await fetch(${literal(endpoint)}, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experimentID: ${literal(settings.experiment_id ?? "")},
          filename,
          data: jsPsych.data.get().csv(),
        }),
      });
      if (!response.ok) throw new Error("the server responded with " + response.status);
      ${ending.saved}
    } catch (error) {
      jsPsych.data.get().localSave("csv", filename);
      // abortExperiment leaves the message on screen; ending the trial normally would clear it
      // before the participant could read why they are holding a file.
      jsPsych.abortExperiment(${ending.failed});
      return;
    }
    ${ending.finish}
  }`;
}

function downloadStep(filename: string, ending: Ending | undefined) {
  return `() => {
    ${savingScreen("Downloading your data.")}
    jsPsych.data.get().localSave("csv", ${filename});
    ${ending?.message ? showMessage(ending.message) : ""}
  }`;
}

/** The step that saves the data and then ends the study the way `ending` says. */
export function compileDataStep(
  settings: DataSettings,
  experimentName: string,
  ending: Ending | undefined,
) {
  const prefix = settings.filename_prefix ?? experimentName;
  const filename = `${literal(prefix)} + "_" + ${PARTICIPANT_ID} + ".csv"`;
  const func =
    settings.save === "post"
      ? uploadStep(settings, filename, ending)
      : downloadStep(filename, ending);
  return {
    plugin: CALL_FUNCTION_PLUGIN,
    source: `{\n  type: jsPsychCallFunction,\n  async: ${settings.save === "post"},\n  func: ${func},\n}`,
  };
}

/** Ends a study that keeps no data with its message. */
export function compileMessageStep(message: string) {
  return {
    plugin: CALL_FUNCTION_PLUGIN,
    source: `{\n  type: jsPsychCallFunction,\n  func: () => {\n    ${showMessage(message)}\n  },\n}`,
  };
}

/** The column the row written on reaching an early ending names that ending in. */
export const ENDING_COLUMN = "ending";

// jsPsych writes added properties over a trial's own data, so a link carrying ?ending=… would
// otherwise relabel every row, and the rows an ending keeps are picked out by that column.
const STUDY_COLUMNS = [ENDING_COLUMN, "checkpoint"];

export function compileParticipantProperties(experimentName: string, idParam: string) {
  return (
    `const urlParameters = Object.fromEntries(\n` +
    `  [...new URLSearchParams(window.location.search)].filter(([name]) => !${literal(STUDY_COLUMNS)}.includes(name)),\n` +
    `);\n` +
    `const ${PARTICIPANT_ID} = urlParameters[${literal(idParam)}] ?? jsPsych.randomization.randomID(10);\n` +
    // The platform's id wins over any participant_id that also happens to be in the link.
    `jsPsych.data.addProperties({\n` +
    `  experiment: ${literal(experimentName)},\n` +
    `  ...urlParameters,\n` +
    `  participant_id: ${PARTICIPANT_ID},\n` +
    `});\n`
  );
}
