import type { ParameterValue, TrialNode } from "./types.ts";

// Rules a plugin keeps that no declaration of its parameters can state: the cases where a plugin
// given the wrong combination of settings does not fail, but runs and records nothing of use.

/** Whether a setting holds something, where a column or code counts as holding it. */
function isGiven(value: ParameterValue | undefined) {
  return value !== undefined && value !== null && value !== "";
}

// Visual search builds its display from a target, a foil and a set size, or else from a list of
// images; with neither it shows an empty circle and still scores every key pressed.
function visualSearchProblems(params: Record<string, ParameterValue>) {
  const generated = ["target", "foil", "set_size"].filter((name) => isGiven(params[name]));
  const listed = Array.isArray(params.stimuli)
    ? params.stimuli.length > 0
    : isGiven(params.stimuli);
  if (generated.length > 0 && generated.length < 3) {
    return ["needs a target, a foil and a set size together"];
  }
  if (generated.length === 3 && listed) {
    return ["takes either a target, a foil and a set size, or a list of images, not both"];
  }
  if (generated.length === 0 && !listed) {
    return ["needs either a target, a foil and a set size, or a list of images"];
  }
  return [];
}

// Cloze makes a gap of every word between percent signs. Text with none makes the plugin fail as
// the trial starts, and a stray one opens a gap that runs to the end of the text.
function clozeProblems(params: Record<string, ParameterValue>) {
  const text = params.text;
  if (typeof text !== "string") return [];
  const signs = text.split("%").length - 1;
  if (signs >= 2 && signs % 2 === 0) return [];
  return [
    'needs each gap written between two percent signs, as in "the %cat% sat", ' +
      "with a percent sign in the text itself written &#37;",
  ];
}

// An external page is left by a key or by a button on the page; with neither, never.
function externalPageProblems(params: Record<string, ParameterValue>) {
  return isGiven(params.cont_key) || isGiven(params.cont_btn)
    ? []
    : ["needs a key or a button on the page to continue with (cont_key or cont_btn)"];
}

const RULES: Record<string, (params: Record<string, ParameterValue>) => string[]> = {
  "visual-search-circle": visualSearchProblems,
  cloze: clozeProblems,
  "external-html": externalPageProblems,
};

/** What is wrong with how a step combines its settings, by its plugin's own rules. */
export function pluginRuleProblems(trial: TrialNode) {
  return RULES[trial.plugin]?.(trial.params ?? {}) ?? [];
}
