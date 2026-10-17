import {
  ALL_ROWS,
  CALL_FUNCTION_PLUGIN,
  compileDataStep,
  compileMessageStep,
  compileRedirectStep,
  ENDING_COLUMN,
} from "./data.ts";
import { literal } from "./emit.ts";
import { COMPLETE_ENDING, endingOf, retentionOf } from "./recruitment.ts";
import type { EndNode, Ending, Spec } from "./types.ts";

const STUDY_ENDED = "<p>The study has ended. Thank you for your time.</p>";

// An ending that keeps nothing must not save anything anywhere, a download included: an ethics
// board that asks for a declined participant's data to be discarded means all of it.
function finishWithoutSaving(ending: Ending | undefined) {
  if (ending?.url) return compileRedirectStep(ending.url);
  return ending?.message ? compileMessageStep(ending.message) : null;
}

/** Saves what the ending keeps, then ends the study its way; null when nothing needs doing. */
function finishingStep(spec: Spec, name: string, ending: Ending | undefined) {
  const keep = retentionOf(ending);
  if (!spec.data || keep === "nothing") return finishWithoutSaving(ending);
  const rows =
    keep === "checkpoint" ? `${ALL_ROWS}.filter({ ${ENDING_COLUMN}: ${literal(name)} })` : ALL_ROWS;
  return compileDataStep(spec.data, spec.name, ending, rows);
}

/** What runs once every step has: the `complete` ending. */
export function compileCompletion(spec: Spec) {
  return finishingStep(spec, COMPLETE_ENDING, endingOf(spec.recruitment, COMPLETE_ENDING));
}

// The row is written before saving so the saved data says which way this participant left, and
// is the one row an ending that keeps only a checkpoint saves. An end step stops the study
// whatever its ending holds, so the steps after it never run.
export function compileEndStep(node: EndNode, spec: Spec) {
  const marker =
    `{\n  type: jsPsychCallFunction,\n  func: () => {},\n` +
    `  data: { ${ENDING_COLUMN}: ${literal(node.ending)} },\n}`;
  const ending = endingOf(spec.recruitment, node.ending);
  const reached = ending?.url || ending?.message ? ending : { ...ending, message: STUDY_ENDED };
  const finishing = finishingStep(spec, node.ending, reached) ?? compileMessageStep(STUDY_ENDED);
  return {
    plugin: CALL_FUNCTION_PLUGIN,
    source: `{\n  timeline: [${marker}, ${finishing.source}],\n}`,
  };
}
