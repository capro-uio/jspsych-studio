import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import type { AssignNode, Spec } from "../src/types.ts";
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

describe("splitting participants between groups", () => {
  it("draws a group in the browser and gates each branch on it", () => {
    const { source } = compileSpec(study(assign()), schemas);
    expect(source).toContain("let assignedGroup = null;");
    expect(source).toContain('sampleWithoutReplacement(["alpha","beta"], 1)[0]');
    expect(source).toContain('conditional_function: () => assignedGroup === "alpha"');
    expect(source).toContain('conditional_function: () => assignedGroup === "beta"');
  });

  it("records the group on every row, under a chosen column name", () => {
    const { source } = compileSpec(study(assign({ record_as: "condition" })), schemas);
    expect(source).toContain('addProperties({ ["condition"]: assignedGroup })');
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

  it("falls back to a local draw if the service cannot be reached", () => {
    const { source } = compileSpec(
      study(assign({ method: "balanced" }), { save: "post", experiment_id: "x" }),
      schemas,
    );
    const fallback = source.slice(source.indexOf("catch"));
    expect(fallback).toContain("sampleWithoutReplacement");
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
