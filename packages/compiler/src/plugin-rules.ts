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

function isGrid(value: ParameterValue | undefined): value is unknown[][] {
  return Array.isArray(value) && value.every(Array.isArray);
}

// The serial reaction time plugins light the square at the target's row and column, and look up
// its key at the same place in the grid of keys; outside the grid, or on a gap, nothing lights up
// and no key can be right. Their defaults are a single row of four squares, with four keys.
function gridProblems(params: Record<string, ParameterValue>, keyed: boolean) {
  const grid = params.grid ?? [[1, 1, 1, 1]];
  if (!isGrid(grid)) return [];
  const problems: string[] = [];
  const target = params.target;
  if (Array.isArray(target) && target.length === 2 && target.every(Number.isInteger)) {
    const [row, column] = target as number[];
    if (grid[row]?.[column] !== 1) {
      problems.push(`lights square [${row}, ${column}], which is not a square of its grid`);
    }
  }
  const keys = params.choices ?? [["3", "5", "7", "9"]];
  if (keyed && isGrid(keys)) {
    const sameShape =
      keys.length === grid.length && keys.every((row, index) => row.length === grid[index].length);
    if (!sameShape) problems.push("needs one key in its choices for each place in its grid");
    // Scoring compares the key pressed with the target's key, looked up by the key: a target with
    // no key, or a key used twice, makes even the right press score wrong.
    const [row, column] = Array.isArray(target) ? (target as number[]) : [];
    if (sameShape && keys[row]?.[column] === "") {
      problems.push(`has no key for the square it lights, [${row}, ${column}]`);
    }
    const used = keys.flat().filter((key) => key !== "");
    if (new Set(used.map((key) => String(key).toLowerCase())).size < used.length) {
      problems.push("uses a key for more than one place in its grid");
    }
  }
  return problems;
}

const RULES: Record<string, (params: Record<string, ParameterValue>) => string[]> = {
  "serial-reaction-time": (params) => gridProblems(params, true),
  "serial-reaction-time-mouse": (params) => gridProblems(params, false),
  "visual-search-circle": visualSearchProblems,
  cloze: clozeProblems,
  "external-html": externalPageProblems,
  "virtual-chinrest": viewingDistanceProblems,
};

/** What is wrong with how a step combines its settings, by its plugin's own rules. */
export function pluginRuleProblems(trial: TrialNode) {
  return RULES[trial.plugin]?.(trial.params ?? {}) ?? [];
}
