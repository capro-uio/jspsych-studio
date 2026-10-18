import type { ExperimentSettings } from "./types.ts";

// A colour is written into the page's stylesheet, so only the plain colour forms are accepted: a
// value holding a brace or a tag would otherwise end the rule or the style element it sits in.
export const COLOR_PATTERN =
  "^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|(rgb|rgba|hsl|hsla)\\([0-9.,%\\s/deg]+\\))$";

export function isColor(value: string) {
  return new RegExp(COLOR_PATTERN).test(value);
}

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
