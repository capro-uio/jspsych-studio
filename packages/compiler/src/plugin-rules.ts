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

// An element id the plugin looks up with a CSS selector, which any other text makes it throw on.
const ELEMENT_ID = /^-?[A-Za-z_][\w-]*$/;

// An external page is left by a button on it: the plugin listens for its key on an element that
// never has the keyboard, so a key alone leaves the participant on the page. The page is fetched
// from the study's own site, so its address is given relative to the study.
function externalPageProblems(params: Record<string, ParameterValue>) {
  const problems: string[] = [];
  const button = params.cont_btn;
  if (!isGiven(button)) {
    problems.push("needs the id of a button on the page to continue with (cont_btn)");
  } else if (typeof button === "string" && !ELEMENT_ID.test(button)) {
    problems.push(`names "${button}" as its button, which is not an element id`);
  }
  if (typeof params.url === "string" && /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(params.url)) {
    problems.push(
      `loads "${params.url}", but the page has to come from the study's own site, given as an address beside it such as consent.html`,
    );
  }
  return problems;
}

// Sizes in degrees come from the blind-spot measurement; without one the plugin stops and waits.
function viewingDistanceProblems(params: Record<string, ParameterValue>) {
  return params.resize_units === "deg" && params.blindspot_reps === 0
    ? ["sizes things in degrees, which needs at least one blind-spot measurement"]
    : [];
}

const RULES: Record<string, (params: Record<string, ParameterValue>) => string[]> = {
  "visual-search-circle": visualSearchProblems,
  cloze: clozeProblems,
  "external-html": externalPageProblems,
  "virtual-chinrest": viewingDistanceProblems,
};

/** What is wrong with how a step combines its settings, by its plugin's own rules. */
export function pluginRuleProblems(trial: TrialNode) {
  return RULES[trial.plugin]?.(trial.params ?? {}) ?? [];
}
