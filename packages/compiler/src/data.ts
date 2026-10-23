import { literal } from "./emit.ts";
import { extensionIdentifier } from "./identifiers.ts";
import { endingNames, endingOf, PARTICIPANT_PLACEHOLDER, retentionOf } from "./recruitment.ts";
import type { ConditionFallback, DataSettings, Ending, Spec } from "./types.ts";
import type { Problem } from "./validate.ts";

export const DATAPIPE_URL = "https://pipe.jspsych.org";

// Bound once, before the timeline runs, so the filename and the return address never depend on a
// trial having written a row first.
const PARTICIPANT_ID = "participantId";

export const CALL_FUNCTION_PLUGIN = "call-function";

// DataPipe refuses a request over 32 MB with a bare error, and gzip shrinks a CSV several times
// over, so a long study still fits. Its server unpacks a gzipped body before reading it. A browser
// that cannot compress sends the body as it is, as DataPipe's own client does.
export const UPLOAD_HELPERS = `async function gzipForDataPipe(json) {
  if (typeof CompressionStream === "undefined") return null;
  try {
    return await new Response(
      new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")),
    ).blob();
  } catch {
    return null;
  }
}
async function postToDataPipe(url, body) {
  const json = JSON.stringify(body);
  const compressed = await gzipForDataPipe(json);
  return fetch(url, {
    method: "POST",
    headers: compressed
      ? { "Content-Type": "application/json", "Content-Encoding": "gzip" }
      : { "Content-Type": "application/json" },
    body: compressed ?? json,
  });
}
`;

function savingScreen(message: string) {
  return showOnScreen(`<p>${message}</p>`);
}

function showOnScreen(html: string) {
  return `jsPsych.getDisplayElement().innerHTML = ${literal(html)};`;
}

const SAVING_MESSAGE = "Saving your data, please do not close this window.";

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

/**
 * How the upload step ends: with the participant staying, or being sent back to a platform.
 * `running` says whether the timeline still runs, as it does for an upload step, or has stopped,
 * as it has by the time a study that saves as it goes hears its data arrived.
 */
function uploadEnding(ending: Ending | undefined, running = true) {
  if (ending?.message) {
    return {
      declaration: "",
      saved: "",
      failed: literal(UPLOAD_FAILED + ending.message),
      finish: running ? showMessage(ending.message) : showOnScreen(ending.message),
    };
  }
  if (!ending?.url) {
    return {
      declaration: "",
      saved: savingScreen("Your data has been saved. Thank you!"),
      failed: literal(UPLOAD_FAILED),
      finish: running ? "done();" : "",
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

function withoutTrailingSlashes(url: string) {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
}

/** The study's own DataPipe, when it names one; an empty address means DataPipe's own. */
export function ownDataPipeAddress(settings: DataSettings | undefined) {
  return settings?.endpoint ? withoutTrailingSlashes(settings.endpoint) : undefined;
}

/** Where the study's DataPipe is, without a trailing slash, so a route can follow it. */
export function dataPipeAddress(settings: DataSettings | undefined) {
  return ownDataPipeAddress(settings) ?? DATAPIPE_URL;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Why an address cannot be a study's DataPipe, or null when it can. The study adds `/api/...` to
 * it, so it is a full https address, or http on this computer, that a path can follow.
 */
export function dataPipeAddressProblem(address: unknown): string | null {
  if (typeof address !== "string") {
    return `the DataPipe address is a web address, not ${JSON.stringify(address)}`;
  }
  if (/[\s"<>\\^`{|}\p{Cc}]/u.test(address)) {
    return 'the DataPipe address cannot hold spaces, hidden characters or any of " < > \\ ^ ` { | }';
  }
  const url = /^https?:\/\//i.test(address) && URL.canParse(address) ? new URL(address) : null;
  if (!url) {
    return `the DataPipe address must be a full web address starting with https://, not ${JSON.stringify(address)}`;
  }
  if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
    return "the DataPipe address must start with https://; http:// is only for a DataPipe on this computer (localhost)";
  }
  if (url.username || url.password) {
    return "the DataPipe address cannot hold a user name or password";
  }
  if (address.includes("?") || address.includes("#")) {
    return "the DataPipe address cannot have a ? or # part, because the study adds its own path after it";
  }
  return null;
}

/** Whether the study's own DataPipe address, if it gives one, is usable; none or empty means DataPipe's own. */
export function dataPipeAddressProblems(spec: Spec): Problem[] {
  const endpoint: unknown = spec.data?.endpoint;
  if (endpoint === undefined || endpoint === "") return [];
  const message = dataPipeAddressProblem(endpoint);
  return message ? [{ message, severity: "error" }] : [];
}

// DataPipe takes a recording as base64 at its own address, and stores the file it decodes.
function recordingsUpload(settings: DataSettings, rows: string, recordings: boolean) {
  if (!recordings) return "";
  const endpoint = literal(`${dataPipeAddress(settings)}/api/base64/`);
  return `await uploadRecordings(${rows}, filename, ${endpoint}, ${literal(settings.experiment_id ?? "")});`;
}

// Losing a participant's data because an upload failed is unrecoverable, so a failed upload falls
// back to a download rather than ending the experiment as if the data had been stored.
function uploadStep(
  settings: DataSettings,
  filename: string,
  studyEnding: Ending | undefined,
  rows: string,
  recordings: boolean,
) {
  const endpoint = `${dataPipeAddress(settings)}/api/data/`;
  const saveRecordings = recordingsUpload(settings, rows, recordings);
  const ending = uploadEnding(studyEnding);
  // jsPsych ends an async call-function trial when `done` is called, not when the promise settles.
  return `async (done) => {
    ${savingScreen(SAVING_MESSAGE)}
    const filename = ${filename};
    ${ending.declaration}
    try {
      ${saveRecordings}
      const response = await postToDataPipe(${literal(endpoint)}, {
        experimentID: ${literal(settings.experiment_id ?? "")},
        filename,
        data: ${rows}.csv(),
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

/** What a study that saves as it goes runs once DataPipe has answered its final upload. */
const AFTER_SAVING = "afterSaving";

// The DataPipe extension uploads everything once the timeline has stopped, so this step only
// readies what comes after: it uploads the recordings, says how the study ends, and stops it.
// The study stops even if uploading the recordings throws, or the participant would wait on the
// saving screen with no upload ever made. Nothing is passed to abortExperiment, since jsPsych
// would write that message over the screen saying whether the data arrived.
function streamingStep(
  settings: DataSettings,
  filename: string,
  studyEnding: Ending | undefined,
  rows: string,
  recordings: boolean,
) {
  return `async () => {
    ${savingScreen(SAVING_MESSAGE)}
    const filename = ${filename};
    ${AFTER_SAVING} = ${afterSaving("filename", studyEnding, rows)};
    ${stopAfter(recordingsUpload(settings, rows, recordings))}
  }`;
}

function stopAfter(upload: string) {
  const stop = "jsPsych.abortExperiment();";
  return upload ? `try {\n      ${upload}\n    } finally {\n      ${stop}\n    }` : stop;
}

function afterSaving(filename: string, studyEnding: Ending | undefined, rows: string) {
  const ending = uploadEnding(studyEnding, false);
  return `(saved) => {
    ${ending.declaration}
    if (!saved) {
      ${rows}.localSave("csv", ${filename});
      jsPsych.getDisplayElement().innerHTML = ${ending.failed};
      return;
    }
    ${ending.saved}
    ${ending.finish}
  }`;
}

function participantFilename(settings: DataSettings, experimentName: string) {
  const prefix = settings.filename_prefix ?? experimentName;
  return `${literal(prefix)} + "_" + ${PARTICIPANT_ID} + ".csv"`;
}

/** Whether the study sends each row to DataPipe as it is recorded, as well as all of them at the end. */
export function savesAsItGoes(spec: Spec): spec is Spec & { data: DataSettings } {
  return streams(spec.data);
}

function streams(settings: DataSettings | undefined) {
  return settings?.save === "post" && settings.stream === true;
}

/** The extension, as the schema bundle names it, that sends each row to DataPipe as it goes. */
export const DATA_PIPE = "pipe";

/**
 * Readies the DataPipe extension: what it is told, and what happens once it has uploaded. Every
 * step that ends the study says how it ends; should the timeline stop some other way, the study
 * ends as one with no ending of its own does.
 */
export function compileStreaming(settings: DataSettings, experimentName: string) {
  const filename = participantFilename(settings, experimentName);
  const ownAddress = ownDataPipeAddress(settings);
  const params = [
    `experiment_id: ${literal(settings.experiment_id ?? "")}`,
    `filename: () => ${filename}`,
    ...(ownAddress ? [`base_url: ${literal(ownAddress)}`] : []),
    `wait_message: ${literal(`<p>${SAVING_MESSAGE}</p>`)}`,
    `on_save: (result) => ${AFTER_SAVING}(result.ok)`,
  ];
  return {
    declaration: `let ${AFTER_SAVING} = ${afterSaving(filename, undefined, ALL_ROWS)};\n`,
    extension: `{ type: ${extensionIdentifier(DATA_PIPE)}, params: { ${params.join(", ")} } }`,
  };
}

// Rows already sent cannot be called back, so no ending may keep less than all of them.
export function streamingProblems(spec: Spec): Problem[] {
  const stream: unknown = spec.data?.stream;
  if (stream === undefined || stream === false) return [];
  if (stream !== true) {
    return [
      {
        message: `saving data as it goes is true or false, not ${JSON.stringify(stream)}`,
        severity: "error",
      },
    ];
  }
  if (spec.data?.save !== "post") {
    return [
      { message: "saving data as it goes needs data uploaded to DataPipe", severity: "error" },
    ];
  }
  return endingNames(spec.recruitment)
    .filter((name) => retentionOf(endingOf(spec.recruitment, name)) !== "all")
    .map((name) => ({
      message:
        `the "${name}" ending keeps less than all the data, but data saved as it goes has ` +
        "already been sent; keep all of it, or save the data only at the end",
      severity: "error",
    }));
}

export const CONDITION_FALLBACKS: readonly ConditionFallback[] = ["stop", "random"];

/** What the study does when DataPipe hands out no condition: stop, unless it opts to draw one. */
export function conditionFallbackOf(data: DataSettings | undefined): ConditionFallback {
  return data?.condition_fallback ?? "stop";
}

export function conditionFallbackNote(data: DataSettings | undefined) {
  return conditionFallbackOf(data) === "random"
    ? "If DataPipe cannot hand out a condition, the study draws one in the browser and keeps going, so groups may become unbalanced, and nothing in the data says which participants were drawn this way."
    : "If DataPipe cannot hand out a condition, the study stops and tells the participant, as DataPipe advises, rather than guess.";
}

export function conditionFallbackProblems(spec: Spec): Problem[] {
  const fallback: unknown = spec.data?.condition_fallback;
  if (fallback === undefined) return [];
  if (!CONDITION_FALLBACKS.includes(fallback as ConditionFallback)) {
    const choices = CONDITION_FALLBACKS.map((choice) => `"${choice}"`).join(" or ");
    return [
      {
        message: `when no condition comes back the study does ${choices}, not ${JSON.stringify(fallback)}`,
        severity: "error",
      },
    ];
  }
  if (spec.data?.save !== "post") {
    return [
      {
        message: "what to do when no condition comes back needs data uploaded to DataPipe",
        severity: "error",
      },
    ];
  }
  return [];
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
  recordings = false,
) {
  const filename = participantFilename(settings, experimentName);
  const upload = streams(settings) ? streamingStep : uploadStep;
  const func =
    settings.save === "post"
      ? upload(settings, filename, ending, rows, recordings)
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
  /** Every column the study writes, its plugins' own included, which a link must not overwrite. */
  reserved: string[];
}) {
  const { experimentName, idParam, reserved } = options;
  return (
    `const linkParameters = new URLSearchParams(window.location.search);\n` +
    `const ${PARTICIPANT_ID} = linkParameters.get(${literal(idParam)}) ?? jsPsych.randomization.randomID(10);\n` +
    `const reservedColumns = new Set(${literal(reserved)});\n` +
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
