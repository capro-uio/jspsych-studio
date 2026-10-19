import { pluginIdentifier } from "./identifiers.ts";
import type { ParameterValue, TrialNode } from "./types.ts";

/** The column a step that turned a participant away marks their row with. */
export const EXCLUDED_COLUMN = "excluded";

// jsPsych's browser check turns a participant away by aborting the whole study, which skips the
// steps that save the data and send the participant back to their platform. It does so through
// its end_experiment method, whose version is pinned with the plugin's; a subclass ends the trial
// there instead, marking the row, so the study can go on to the ending the step names.
const EXCLUDING_PLUGINS: Record<string, (params: Record<string, ParameterValue>) => boolean> = {
  "browser-check": (params) =>
    isPositive(params.minimum_width) ||
    isPositive(params.minimum_height) ||
    params.inclusion_function !== undefined,
};

function isPositive(value: ParameterValue | undefined) {
  return typeof value === "number" ? value > 0 : value !== undefined && value !== null;
}

/** Whether a plugin can turn participants away. */
export function canExcludeParticipants(plugin: string) {
  return Object.hasOwn(EXCLUDING_PLUGINS, plugin);
}

/** Whether a step is set to turn some participants away, by a minimum size or a rule. */
export function excludesParticipants(trial: TrialNode) {
  return (
    canExcludeParticipants(trial.plugin) && EXCLUDING_PLUGINS[trial.plugin](trial.params ?? {})
  );
}

export function excludingIdentifier(plugin: string) {
  return `${pluginIdentifier(plugin)}Excluding`;
}

export function compileExcludingPlugin(plugin: string) {
  return (
    `class ${excludingIdentifier(plugin)} extends ${pluginIdentifier(plugin)} {\n` +
    `  end_experiment(features) {\n` +
    `    this.jsPsych.finishTrial({ ...Object.fromEntries(features), ${EXCLUDED_COLUMN}: true });\n` +
    `  }\n` +
    `}\n`
  );
}

/** Whether the step just run turned the participant away. */
export const WAS_EXCLUDED = `() => jsPsych.data.getLastTrialData().values()[0]?.${EXCLUDED_COLUMN} === true`;
