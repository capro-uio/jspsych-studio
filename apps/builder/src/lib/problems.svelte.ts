import { compileSpec, SpecError, type Problem } from "@tachisto/compiler";
import { exportedSpec } from "./project.svelte.ts";
import { schemas } from "./schemas.ts";

/**
 * Problems found in the current experiment, so a step can say for itself what it still needs.
 * Errors stop the experiment from being built; warnings name settings worth a second look.
 */
export function currentProblems(): Problem[] {
  try {
    return compileSpec(exportedSpec(), schemas).warnings;
  } catch (error) {
    if (error instanceof SpecError) return error.problems;
    throw error;
  }
}

export function problemsAt(problems: Problem[], path: number[]) {
  const key = path.join(".");
  return problems.filter((problem) => problem.path?.join(".") === key);
}

/** Problems about the experiment as a whole rather than about one step. */
export function overallProblems(problems: Problem[]) {
  return problems.filter((problem) => !problem.path);
}

export function errorsOf(problems: Problem[]) {
  return problems.filter((problem) => problem.severity === "error");
}

export function warningsOf(problems: Problem[]) {
  return problems.filter((problem) => problem.severity === "warning");
}

/** How many steps have a problem among these, counting a step once however many it has. */
export function stepCount(problems: Problem[]) {
  const steps = problems.flatMap((problem) => (problem.path ? [problem.path.join(".")] : []));
  return steps.filter((step, index) => steps.indexOf(step) === index).length;
}
