import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import type { SpecError } from "../src/validate.ts";
import type { AssignNode, CounterbalanceNode, Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const trial = (stimulus: string) => ({
  kind: "trial" as const,
  plugin: "html-keyboard-response",
  params: { stimulus },
});

const assign = (overrides: Partial<AssignNode> = {}): AssignNode => ({
  kind: "assign",
  method: "random",
  groups: [
    { name: "alpha", children: [trial("<p>Alpha</p>")] },
    { name: "beta", children: [trial("<p>Beta</p>")] },
  ],
  ...overrides,
});

const study = (node: AssignNode, data?: Spec["data"]): Spec => ({
  name: "between-subjects",
  data,
  timeline: [node],
});

const problemsOf = (spec: Spec) => {
  try {
    compileSpec(spec, schemas);
    return [];
  } catch (error) {
    return (error as SpecError).problems.map((problem) => problem.message);
  }
};

describe("splitting participants between groups", () => {
  it("draws a group in the browser and gates each branch on it", () => {
    const { source } = compileSpec(study(assign()), schemas);
    expect(source).toContain("const assignedGroups = {};");
    expect(source).toContain('sampleWithoutReplacement(["alpha","beta"], 1)[0]');
    expect(source).toContain('conditional_function: () => assignedGroups["group"] === "alpha"');
    expect(source).toContain('conditional_function: () => assignedGroups["group"] === "beta"');
  });

  it("records the group on every row, under a chosen column name", () => {
    const { source } = compileSpec(study(assign({ record_as: "condition" })), schemas);
    expect(source).toContain('addProperties({ ["condition"]: assignedGroups["condition"] })');
  });

  it("records under the default column when the chosen name is left empty", () => {
    const { source } = compileSpec(study(assign({ record_as: "" })), schemas);
    expect(source).toContain('addProperties({ ["group"]: assignedGroups["group"] })');
  });

  it("draws a group only the first time a loop or block runs the split", () => {
    const { source } = compileSpec(study(assign()), schemas);
    expect(source).toContain(
      'assignedGroups["group"] ??= jsPsych.randomization.sampleWithoutReplacement(["alpha","beta"], 1)[0];',
    );
  });

  it("asks the service only the first time a loop or block runs the split", () => {
    const { source } = compileSpec(
      study(assign({ method: "balanced" }), { save: "post", experiment_id: "x" }),
      schemas,
    );
    const body = source.slice(source.indexOf("async (done)"));
    expect(body.indexOf('if (!assignedGroups["group"]) {')).toBeLessThan(body.indexOf("fetch("));
    expect(body.indexOf("catch (error)")).toBeLessThan(body.indexOf("addProperties"));
    expect(body).toContain('assignedGroups["group"] = options[condition % options.length];');
  });

  it("keeps each split's group under its own column, and gates each on its own", () => {
    const outer = assign({
      record_as: "arm",
      groups: [
        { name: "alpha", children: [assign({ record_as: "dose" })] },
        { name: "beta", children: [trial("<p>Beta</p>")] },
      ],
    });
    const { source } = compileSpec(study(outer), schemas);
    expect(source).toContain('conditional_function: () => assignedGroups["arm"] === "beta"');
    expect(source).toContain('conditional_function: () => assignedGroups["dose"] === "beta"');
    expect(source).toContain('assignedGroups["arm"] ??=');
    expect(source).toContain('assignedGroups["dose"] ??=');
  });

  it("refuses two steps that would record their choice in the same column", () => {
    const nested = (inner: AssignNode | CounterbalanceNode) =>
      study(
        assign({
          groups: [
            { name: "alpha", children: [inner] },
            { name: "beta", children: [trial("<p>Beta</p>")] },
          ],
        }),
      );
    const inner = assign({
      groups: [
        { name: "low", children: [trial("<p>Low</p>")] },
        { name: "high", children: [trial("<p>High</p>")] },
      ],
    });
    const fix = 'give one of them a different column name in its "record group as" setting';
    expect(problemsOf(nested(inner))).toEqual([
      'this split and the split into "low", "high" both record their choice in the column ' +
        `"group", so they would overwrite each other's: ${fix}`,
      'this split and the split into "alpha", "beta" both record their choice in the column ' +
        `"group", so they would overwrite each other's: ${fix}`,
    ]);
    const order: CounterbalanceNode = {
      kind: "counterbalance",
      method: "random",
      record_as: "group",
      tasks: [
        { name: "first", children: [trial("a")] },
        { name: "second", children: [trial("b")] },
      ],
    };
    expect(problemsOf(nested(order))[0]).toBe(
      'this split and the counterbalance of "first", "second" both record their choice in the ' +
        'column "group", so they would overwrite each other\'s: give one of them a different ' +
        'column name in its "record group as" or "record order as" setting',
    );
    const third = study({
      ...assign(),
      groups: [
        { name: "alpha", children: [inner, assign()] },
        { name: "beta", children: [trial("<p>Beta</p>")] },
      ],
    });
    expect(problemsOf(third)[0]).toMatch(/^this split and the split into .* all record/);
    expect(problemsOf(nested(assign({ record_as: "dose" })))).toEqual([]);
  });

  it("asks the data service for a balanced group when told to", () => {
    const { source } = compileSpec(
      study(assign({ method: "balanced" }), { save: "post", experiment_id: "abc123DEF456" }),
      schemas,
    );
    expect(source).toContain("/api/condition/");
    expect(source).toContain('experimentID: "abc123DEF456"');
    expect(source).toContain("async: true");
  });

  it("stops with a message if the service hands out no group", () => {
    const { source } = compileSpec(
      study(assign({ method: "balanced" }), { save: "post", experiment_id: "x" }),
      schemas,
    );
    const fallback = source.slice(source.indexOf("catch (error)"));
    expect(fallback).toContain("jsPsych.abortExperiment(");
    expect(fallback).toContain("could not find out which version of the study to show you");
    expect(fallback).not.toContain("sampleWithoutReplacement");
  });

  it("draws a group in the browser instead, only when the study opts in", () => {
    const { source } = compileSpec(
      study(assign({ method: "balanced" }), {
        save: "post",
        experiment_id: "x",
        condition_fallback: "random",
      }),
      schemas,
    );
    const start = source.indexOf("catch (error)");
    const fallback = source.slice(start, source.indexOf("addProperties", start));
    expect(fallback).toContain('sampleWithoutReplacement(["alpha","beta"], 1)[0]');
    expect(fallback).not.toContain("abortExperiment");
  });

  it("refuses a fallback it does not know, or one with no data service to ask", () => {
    const unknown = study(assign({ method: "balanced" }), {
      save: "post",
      experiment_id: "x",
      condition_fallback: "guess" as never,
    });
    expect(() => compileSpec(unknown, schemas)).toThrow(/"stop" or "random", not "guess"/);

    const downloaded = study(assign(), { save: "download", condition_fallback: "random" });
    expect(() => compileSpec(downloaded, schemas)).toThrow(/needs data uploaded to DataPipe/);
  });

  it("refuses balanced groups with nowhere to keep the count", () => {
    expect(() => compileSpec(study(assign({ method: "balanced" })), schemas)).toThrow(
      /need data uploading to a service/,
    );
  });

  it("rejects duplicate, empty or lonely groups", () => {
    const duplicate = assign({
      groups: [
        { name: "same", children: [trial("a")] },
        { name: "same", children: [trial("b")] },
      ],
    });
    expect(() => compileSpec(study(duplicate), schemas)).toThrow(/names must be different/);

    const lonely = assign({ groups: [{ name: "only", children: [trial("a")] }] });
    expect(() => compileSpec(study(lonely), schemas)).toThrow(/at least two groups/);

    const empty = assign({
      groups: [
        { name: "full", children: [trial("a")] },
        { name: "hollow", children: [] },
      ],
    });
    expect(() => compileSpec(study(empty), schemas)).toThrow(/"hollow" has no steps/);
  });

  it("records a checkpoint as its own row", () => {
    const spec: Spec = {
      name: "progress",
      timeline: [{ kind: "checkpoint", name: "after-consent" }, trial("<p>on we go</p>")],
    };
    expect(compileSpec(spec, schemas).source).toContain('data: { checkpoint: "after-consent" }');
  });
});
