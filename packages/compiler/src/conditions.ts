import { literal } from "./emit.ts";
import type { AccuracyRule, ResponseRule } from "./types.ts";

export function accuracyComparison(rule: AccuracyRule) {
  return rule.accuracy_at_least === undefined
    ? { operator: "<", threshold: rule.accuracy_below ?? 0 }
    : { operator: ">=", threshold: rule.accuracy_at_least };
}

export function isResponseRule(rule: AccuracyRule | ResponseRule): rule is ResponseRule {
  return "response_equals" in rule;
}

/** True when the tagged trials have been answered and their accuracy meets the comparison. */
export function compileAccuracyPredicate(rule: AccuracyRule) {
  const { operator, threshold } = accuracyComparison(rule);
  return (
    `() => {\n` +
    `    const scored = jsPsych.data.get().filter({ tag: ${literal(rule.scope)} });\n` +
    `    return scored.count() > 0 && scored.select("correct").mean() ${operator} ${literal(threshold)};\n` +
    `  }`
  );
}

// A button's response is its index and a key's is the key, so both sides are compared as text:
// a researcher typing 1 into the builder means the same thing the plugin recorded as 1.
function compileResponsePredicate(rule: ResponseRule) {
  const answer = rule.question ? `latest.response?.[${literal(rule.question)}]` : `latest.response`;
  return (
    `() => {\n` +
    `    const latest = jsPsych.data.get().filter({ tag: ${literal(rule.scope)} }).last(1).values()[0];\n` +
    `    return latest !== undefined && String(${answer} ?? "") === ${literal(String(rule.response_equals))};\n` +
    `  }`
  );
}

export function compileBranchPredicate(rule: AccuracyRule | ResponseRule) {
  return isResponseRule(rule) ? compileResponsePredicate(rule) : compileAccuracyPredicate(rule);
}

export function describeAccuracy(rule: AccuracyRule) {
  const { operator, threshold } = accuracyComparison(rule);
  const comparison = operator === "<" ? "below" : "at least";
  return `accuracy on "${rule.scope}" ${comparison} ${threshold}`;
}
