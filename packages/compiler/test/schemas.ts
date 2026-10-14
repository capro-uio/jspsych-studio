import { extractSchemas } from "@jspsych-studio/schemas";
import type { SchemaBundle } from "@jspsych-studio/schemas";

const report = await extractSchemas([
  "@jspsych/plugin-html-keyboard-response",
  "@jspsych/plugin-image-keyboard-response",
  "@jspsych/plugin-survey-likert",
]);

export const schemas: SchemaBundle = { jspsych: report.jspsych, plugins: report.schemas };
