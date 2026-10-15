import type { ExperimentSettings } from "./types.ts";

export const DEFAULT_BACKGROUND = "#ffffff";
export const DEFAULT_TEXT = "#000000";

export function backgroundColor(settings: ExperimentSettings | undefined) {
  return settings?.background_color ?? DEFAULT_BACKGROUND;
}

export function textColor(settings: ExperimentSettings | undefined) {
  return settings?.text_color ?? DEFAULT_TEXT;
}

/** jsPsych's stylesheet sets its own colours, so these have to be stated rather than inherited. */
export function compileAppearance(settings: ExperimentSettings | undefined) {
  if (!settings?.background_color && !settings?.text_color) return "";
  return (
    `body { background-color: ${backgroundColor(settings)}; }\n` +
    `.jspsych-display-element, .jspsych-content { color: ${textColor(settings)}; }\n`
  );
}
