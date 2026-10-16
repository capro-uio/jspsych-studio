import { literal } from "./emit.ts";
import type { DataSettings } from "./types.ts";

export const DATAPIPE_URL = "https://pipe.jspsych.org";

const CALL_FUNCTION_PLUGIN = "call-function";

function savingScreen(message: string) {
  return `jsPsych.getDisplayElement().innerHTML = ${literal(`<p>${message}</p>`)};`;
}

// Losing a participant's data because an upload failed is unrecoverable, so a failed upload falls
// back to a download rather than ending the experiment as if the data had been stored.
function uploadStep(settings: DataSettings, filename: string) {
  const endpoint = `${(settings.endpoint ?? DATAPIPE_URL).replace(/\/+$/, "")}/api/data/`;
  // jsPsych ends an async call-function trial when `done` is called, not when the promise settles.
  return `async (done) => {
    ${savingScreen("Saving your data, please do not close this window.")}
    const filename = ${filename};
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
      ${savingScreen("Your data has been saved. Thank you!")}
    } catch (error) {
      jsPsych.data.get().localSave("csv", filename);
      // abortExperiment leaves the message on screen; ending the trial normally would clear it
      // before the participant could read why they are holding a file.
      jsPsych.abortExperiment(${literal(
        "<p>Your data could not be uploaded, so it has been downloaded to this computer " +
          "instead. Please send the file to the researcher.</p>",
      )});
      return;
    }
    done();
  }`;
}

function downloadStep(filename: string) {
  return `() => {
    ${savingScreen("Downloading your data.")}
    jsPsych.data.get().localSave("csv", ${filename});
  }`;
}

export function compileDataStep(settings: DataSettings, experimentName: string) {
  const prefix = settings.filename_prefix ?? experimentName;
  const filename = `${literal(prefix)} + "_" + jsPsych.data.get().values()[0]?.participant_id + ".csv"`;
  const func = settings.save === "post" ? uploadStep(settings, filename) : downloadStep(filename);
  return {
    plugin: CALL_FUNCTION_PLUGIN,
    source: `{\n  type: jsPsychCallFunction,\n  async: ${settings.save === "post"},\n  func: ${func},\n}`,
  };
}

export function compileParticipantProperties(experimentName: string) {
  return (
    `const urlParameters = Object.fromEntries(new URLSearchParams(window.location.search));\n` +
    `jsPsych.data.addProperties({\n` +
    `  experiment: ${literal(experimentName)},\n` +
    `  participant_id: urlParameters.participant_id ?? jsPsych.randomization.randomID(10),\n` +
    `  ...urlParameters,\n` +
    `});\n`
  );
}
