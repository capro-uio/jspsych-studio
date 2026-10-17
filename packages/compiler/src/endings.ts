import {
  CALL_FUNCTION_PLUGIN,
  compileDataStep,
  compileMessageStep,
  ENDING_COLUMN,
} from "./data.ts";
import { literal } from "./emit.ts";
import { COMPLETE_ENDING, endingOf } from "./recruitment.ts";
import type { EndNode, Ending, Spec } from "./types.ts";

const STUDY_ENDED = "<p>The study has ended. Thank you for your time.</p>";

/** Saves the data, then ends the study the way `ending` says; null when nothing needs doing. */
function finishingStep(spec: Spec, ending: Ending | undefined) {
  if (spec.data) return compileDataStep(spec.data, spec.name, ending);
  return ending?.message ? compileMessageStep(ending.message) : null;
}

/** What runs once every step has: the `complete` ending. */
export function compileCompletion(spec: Spec) {
  return finishingStep(spec, endingOf(spec.recruitment, COMPLETE_ENDING));
}

// The row is written before saving so the saved data says which way this participant left. An
// end step stops the study whatever its ending holds, so the steps after it never run.
export function compileEndStep(node: EndNode, spec: Spec) {
  const marker =
    `{\n  type: jsPsychCallFunction,\n  func: () => {},\n` +
    `  data: { ${ENDING_COLUMN}: ${literal(node.ending)} },\n}`;
  const ending = endingOf(spec.recruitment, node.ending);
  const reached = ending?.url || ending?.message ? ending : { message: STUDY_ENDED };
  const finishing = finishingStep(spec, reached) ?? compileMessageStep(STUDY_ENDED);
  return {
    plugin: CALL_FUNCTION_PLUGIN,
    source: `{\n  timeline: [${marker}, ${finishing.source}],\n}`,
  };
}
