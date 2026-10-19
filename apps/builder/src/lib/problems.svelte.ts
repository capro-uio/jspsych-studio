import { compileSpec, SpecError, type Problem } from "@tachisto/compiler";
import { exportedSpec } from "./project.svelte.ts";
import { schemas } from "./schemas.ts";

/** Problems found in the current experiment, so a step can say for itself what it still needs. */
export function currentProblems(): Problem[] {
  try {
    compileSpec(exportedSpec(), schemas);
    return [];
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
