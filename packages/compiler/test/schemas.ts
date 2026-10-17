import { extractSchemas } from "@jspsych-studio/schemas";
import type { SchemaBundle } from "@jspsych-studio/schemas";

const report = await extractSchemas([
  "@jspsych/plugin-call-function",
  "@jspsych/plugin-html-button-response",
  "@jspsych/plugin-html-keyboard-response",
  "@jspsych/plugin-instructions",
  "@jspsych/plugin-image-keyboard-response",
  "@jspsych/plugin-preload",
  "@jspsych/plugin-survey-likert",
  "@kurokida/jspsych-psychophysics",
]);

export const schemas: SchemaBundle = { jspsych: report.jspsych, plugins: report.schemas };
