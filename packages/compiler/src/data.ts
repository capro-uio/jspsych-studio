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
function uploadStep(
  settings: DataSettings,
  filename: string,
  studyEnding: Ending | undefined,
  rows: string,
) {
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
          data: ${rows}.csv(),
        }),
      });
      if (!response.ok) throw new Error("the server responded with " + response.status);
      ${ending.saved}
    } catch (error) {
      ${rows}.localSave("csv", filename);
      // abortExperiment leaves the message on screen; ending the trial normally would clear it
      // before the participant could read why they are holding a file.
      jsPsych.abortExperiment(${ending.failed});
      return;
    }
    ${ending.finish}
  }`;
}

function downloadStep(filename: string, ending: Ending | undefined, rows: string) {
  return `() => {
    ${savingScreen("Downloading your data.")}
    ${rows}.localSave("csv", ${filename});
    ${ending?.message ? showMessage(ending.message) : ""}
  }`;
}

export const ALL_ROWS = "jsPsych.data.get()";

/**
 * The step that saves the data and then ends the study the way `ending` says. `rows` is the
 * expression for the rows that are kept, every row unless the ending keeps less.
 */
export function compileDataStep(
  settings: DataSettings,
  experimentName: string,
  ending: Ending | undefined,
  rows = ALL_ROWS,
) {
  const prefix = settings.filename_prefix ?? experimentName;
  const filename = `${literal(prefix)} + "_" + ${PARTICIPANT_ID} + ".csv"`;
  const func =
    settings.save === "post"
      ? uploadStep(settings, filename, ending, rows)
      : downloadStep(filename, ending, rows);
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

/** Sends the participant to `url` without saving anything first. */
export function compileRedirectStep(url: string) {
  // The page is leaving, so the trial is never ended: the steps after it must not start.
  return {
    plugin: CALL_FUNCTION_PLUGIN,
    source:
      `{\n  type: jsPsychCallFunction,\n  async: true,\n  func: () => {\n` +
      `    ${savingScreen("Taking you back to finish the study.")}\n` +
      `    window.location.assign(${urlExpression(url)});\n  },\n}`,
  };
}

/** The column the row written on reaching an early ending names that ending in. */
export const ENDING_COLUMN = "ending";

// The rows an ending keeps are picked out by these columns, so the validator keeps the spec's own
// recorded columns off them.
export const STUDY_COLUMNS = [ENDING_COLUMN, "checkpoint"];

/** A link parameter named like a column the study writes is recorded under this prefix instead. */
export const URL_PARAMETER_PREFIX = "url_";

// jsPsych writes added properties over a trial's own data, so a link carrying ?correct=1 would
// otherwise rewrite that column on every row.
export function compileParticipantProperties(options: {
  experimentName: string;
  idParam: string;
  /** The columns the spec says the study writes, which a link parameter must not overwrite. */
  reserved: string[];
  /** The globals of the plugins the study runs, whose own data fields are only known at run time. */
  pluginIdentifiers: string[];
}) {
  const { experimentName, idParam, reserved, pluginIdentifiers } = options;
  return (
    `const linkParameters = new URLSearchParams(window.location.search);\n` +
    `const ${PARTICIPANT_ID} = linkParameters.get(${literal(idParam)}) ?? jsPsych.randomization.randomID(10);\n` +
    `const reservedColumns = new Set([\n` +
    `  ...${literal(reserved)},\n` +
    `  ...[${pluginIdentifiers.join(", ")}].flatMap((plugin) => Object.keys(plugin.info.data ?? {})),\n` +
    `]);\n` +
    `const unreserved = (name) =>\n` +
    `  reservedColumns.has(name) ? unreserved(${literal(URL_PARAMETER_PREFIX)} + name) : name;\n` +
    `const urlParameters = Object.fromEntries(\n` +
    `  [...linkParameters].map(([name, value]) => [unreserved(name), value]),\n` +
    `);\n` +
    `jsPsych.data.addProperties({\n` +
    `  experiment: ${literal(experimentName)},\n` +
    `  ...urlParameters,\n` +
    `  participant_id: ${PARTICIPANT_ID},\n` +
    `});\n`
  );
}
