import { literal } from "./emit.ts";
import type { AccuracyRule } from "./types.ts";

export function accuracyComparison(rule: AccuracyRule) {
  return rule.accuracy_at_least === undefined
    ? { operator: "<", threshold: rule.accuracy_below ?? 0 }
    : { operator: ">=", threshold: rule.accuracy_at_least };
}

/** True when the tagged trials have been answered and their accuracy meets the comparison. */
export function compileAccuracyPredicate(rule: AccuracyRule) {
  const { operator, threshold } = accuracyComparison(rule);
  return (
    `() => {\n` +
    `    const scored = jsPsych.data.get().filter({ tag: ${literal(rule.scope)} });\n` +
    `    return scored.count() > 0 && scored.select("correct").mean() ${operator} ${threshold};\n` +
    `  }`
  );
}

export function describeAccuracy(rule: AccuracyRule) {
  const { operator, threshold } = accuracyComparison(rule);
  const comparison = operator === "<" ? "below" : "at least";
  return `accuracy on "${rule.scope}" ${comparison} ${threshold}`;
}
