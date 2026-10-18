import { extractSchemas, PLUGIN_FAMILIES } from "@jspsych-studio/schemas";
import type { SchemaBundle } from "@jspsych-studio/schemas";

const report = await extractSchemas([
  "@jspsych/plugin-audio-keyboard-response",
  "@jspsych/plugin-audio-button-response",
  "@jspsych/plugin-video-keyboard-response",
  "@jspsych/plugin-video-button-response",
  "@jspsych/plugin-animation",
  "@jspsych/plugin-call-function",
  "@jspsych/plugin-cloze",
  "@jspsych/plugin-free-sort",
  "@jspsych/plugin-iat-html",
  "@jspsych/plugin-maxdiff",
  "@jspsych/plugin-sketchpad",
  "@jspsych/plugin-visual-search-circle",
  "@jspsych/plugin-categorize-html",
  "@jspsych/plugin-same-different-html",
  "@jspsych/plugin-same-different-image",
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
