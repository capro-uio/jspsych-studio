import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { sharedConditionProblems } from "../src/datapipe-setup.ts";
import type { AssignNode, CounterbalanceNode, Spec, SpecNode } from "../src/types.ts";
import type { SpecError } from "../src/validate.ts";
import { schemas } from "./schemas.ts";

const screen = (text: string, tag?: string): SpecNode => ({
  kind: "trial",
  plugin: "html-keyboard-response",
  params: { stimulus: `<p>${text}</p>` },
  ...(tag ? { tag } : {}),
});

const split = (
  groups: number,
  record_as?: string,
  method: AssignNode["method"] = "balanced",
): AssignNode => ({
  kind: "assign",
  method,
  ...(record_as ? { record_as } : {}),
  groups: Array.from({ length: groups }, (_, index) => ({
    name: `group ${index + 1}`,
    children: [screen(`group ${index + 1}`)],
  })),
});

const counterbalance = (
  tasks: number,
  record_as: string,
  method: CounterbalanceNode["method"] = "latin_square",
): CounterbalanceNode => ({
  kind: "counterbalance",
  method,
  record_as,
  tasks: Array.from({ length: tasks }, (_, index) => ({
    name: `task ${index + 1}`,
    children: [screen(`task ${index + 1}`)],
  })),
});

const uploading: Spec["data"] = { save: "post", experiment_id: "abc123DEF456" };

const study = (timeline: SpecNode[], data: Spec["data"] = uploading): Spec => ({
  name: "shared counter",
  data,
  conditions: { words: [{ word: "cat" }, { word: "dog" }] },
  timeline,
});

const warningsOf = (timeline: SpecNode[]) =>
  compileSpec(study(timeline), schemas).warnings.filter((warning) =>
    warning.message.includes("ask DataPipe for a condition"),
  );

describe("steps that share DataPipe's one condition counter", () => {
  it("says nothing when no step asks DataPipe for a condition", () => {
    expect(warningsOf([screen("hi"), split(2, "group", "random")])).toEqual([]);
  });

  it("says nothing when only one step asks", () => {
    expect(warningsOf([split(3)])).toEqual([]);
    expect(warningsOf([split(2, "group", "random"), counterbalance(3, "order")])).toEqual([]);
  });

  it("warns about the whole study, naming both splits, when two splits ask", () => {
    const warnings = warningsOf([split(2), split(3, "dose")]);
    expect(warnings.map((warning) => [warning.severity, warning.path])).toEqual([
      ["warning", undefined],
    ]);
    expect(warnings[0].message).toBe(
      '2 steps ask DataPipe for a condition: the split recording "group" (2 groups) and the ' +
        'split recording "dose" (3 groups). DataPipe keeps one condition counter per experiment ' +
        "and moves it on at every request, so these steps take turns with it instead of each " +
        "counting participants. Their groups will not come out balanced, and can even put every " +
        "participant in the same one. To keep one step balanced, have the others assign at random.",
    );
  });

  it("names a split and a counterbalance together, in the order the study reaches them", () => {
    const [warning] = warningsOf([counterbalance(3, "order"), split(2)]);
    expect(warning.message).toContain(
      'the counterbalance recording "order" (6 orders) and the split recording "group" (2 groups)',
    );
  });

  it("finds the steps however deep they sit in blocks, loops, branches and splits", () => {
    const warnings = warningsOf([
      { kind: "block", conditions: "words", children: [split(2, "colour")] },
      {
        kind: "loop",
        repeat_while: { scope: "practice", accuracy_below: 0.8 },
        children: [screen("practice", "practice"), counterbalance(2, "practice_order")],
      },
      {
        kind: "branch",
        when: { scope: "practice", accuracy_at_least: 0.8 },
        then: [split(2, "dose", "random")],
        otherwise: [counterbalance(2, "retry_order")],
      },
      {
        kind: "assign",
        method: "random",
        groups: [
          { name: "a", children: [split(4, "inner")] },
          { name: "b", children: [screen("b")] },
        ],
      },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toMatch(/^4 steps ask DataPipe/);
    for (const column of ["colour", "practice_order", "retry_order", "inner"]) {
      expect(warnings[0].message).toContain(`"${column}"`);
    }
    expect(warnings[0].message).not.toContain('"dose"');
  });

  it("leaves a study that does not upload to DataPipe to the errors it already has", () => {
    const spec = study([split(2), counterbalance(2, "order")], { save: "download" });
    expect(sharedConditionProblems(spec)).toEqual([]);
    let thrown: SpecError | undefined;
    try {
      compileSpec(spec, schemas);
    } catch (error) {
      thrown = error as SpecError;
    }
    expect(thrown?.problems.map((problem) => problem.severity)).toEqual(["error", "error"]);
  });

  it("still lets the study build, since a researcher may accept it", () => {
    expect(compileSpec(study([split(2), counterbalance(2, "order")]), schemas).source).toContain(
      "/api/condition/",
    );
  });
});
