import { extractSchemas, PLUGIN_FAMILIES } from "@jspsych-studio/schemas";
import type { SchemaBundle } from "@jspsych-studio/schemas";

const report = await extractSchemas([
  "@jspsych/plugin-audio-keyboard-response",
  "@jspsych/plugin-audio-button-response",
  "@jspsych/plugin-video-keyboard-response",
  "@jspsych/plugin-video-button-response",
  "@jspsych/plugin-call-function",
  "@jspsych/plugin-html-button-response",
  "@jspsych/plugin-html-keyboard-response",
  "@jspsych/plugin-html-slider-response",
  "@jspsych/plugin-image-slider-response",
  "@jspsych/plugin-audio-slider-response",
  "@jspsych/plugin-video-slider-response",
  "@jspsych/plugin-instructions",
  "@jspsych/plugin-image-keyboard-response",
  "@jspsych/plugin-preload",
  "@jspsych/plugin-survey-likert",
  "@jspsych/plugin-survey-multi-choice",
  "@jspsych/plugin-survey-multi-select",
  "@kurokida/jspsych-psychophysics",
]);

export const schemas: SchemaBundle = {
  jspsych: report.jspsych,
  families: PLUGIN_FAMILIES,
  plugins: report.schemas,
};
