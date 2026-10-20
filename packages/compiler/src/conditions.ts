import { literal } from "./emit.ts";
import type { AccuracyRule, ResponseRule, SpecNode } from "./types.ts";
import { isPlainObject, trialsOf } from "./variables.ts";

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
// a researcher typing 1 into the builder means the same thing the plugin recorded as 1. A checkbox
// question's answer is the list of options ticked, and matches when the option is among them.
function compileResponsePredicate(rule: ResponseRule) {
  const answer = rule.question ? `latest.response?.[${literal(rule.question)}]` : `latest.response`;
  const expected = literal(String(rule.response_equals));
  return (
    `() => {\n` +
    `    const latest = jsPsych.data.get().filter({ tag: ${literal(rule.scope)} }).last(1).values()[0];\n` +
    `    const answer = latest === undefined ? undefined : ${answer};\n` +
    `    return Array.isArray(answer) ? answer.map(String).includes(${expected}) : latest !== undefined && String(answer ?? "") === ${expected};\n` +
    `  }`
  );
}

/**
 * The names the trials carrying a tag record their answers under, as a question step does: each
 * question's `name`, or `Q0`, `Q1`… for one without. Null when none of them asks questions; empty
 * when they do but their questions come from a column or code, so the names are not known here.
 */
export function questionNames(nodes: SpecNode[], tag: string): string[] | null {
  const asking = trialsOf(nodes).filter(
    (trial) => trial.tag === tag && "questions" in (trial.params ?? {}),
  );
  if (asking.length === 0) return null;
  const names = asking.flatMap((trial) => {
    const questions = trial.params?.questions;
    if (!Array.isArray(questions)) return [];
    return questions.map((question, index) =>
      isPlainObject(question) && typeof question.name === "string" && question.name
        ? question.name
        : `Q${index}`,
    );
  });
  return [...new Set(names)];
}

export function compileBranchPredicate(rule: AccuracyRule | ResponseRule) {
  return isResponseRule(rule) ? compileResponsePredicate(rule) : compileAccuracyPredicate(rule);
}

export function describeAccuracy(rule: AccuracyRule) {
  const { operator, threshold } = accuracyComparison(rule);
  const comparison = operator === "<" ? "below" : "at least";
  return `accuracy on "${rule.scope}" ${comparison} ${threshold}`;
}
