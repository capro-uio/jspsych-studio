import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import type { BranchNode, Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const screening = {
  kind: "trial" as const,
  plugin: "html-keyboard-response",
  tag: "screening",
  params: { stimulus: "<p>screening</p>" },
};

const study = (branch: BranchNode): Spec => ({
  name: "routing",
  timeline: [screening, branch],
});

const branch = (overrides: Partial<BranchNode> = {}): BranchNode => ({
  kind: "branch",
  when: { scope: "screening", accuracy_at_least: 0.8 },
  then: [{ kind: "trial", plugin: "html-keyboard-response", params: { stimulus: "<p>in</p>" } }],
  otherwise: [
    { kind: "trial", plugin: "html-keyboard-response", params: { stimulus: "<p>out</p>" } },
  ],
  ...overrides,
});

describe("branching on how a participant did", () => {
  it("gates each path on the same measurement, inverted", () => {
    const { source } = compileSpec(study(branch()), schemas);
    expect(source).toContain('filter({ tag: "screening" })');
    expect(source).toContain('select("correct").mean() >= 0.8');
    expect(source.match(/conditional_function/g)).toHaveLength(2);
    expect(source).toContain("conditional_function: () => !(");
  });

  it("supports the other comparison", () => {
    const { source } = compileSpec(
      study(branch({ when: { scope: "screening", accuracy_below: 0.5 } })),
      schemas,
    );
    expect(source).toContain('select("correct").mean() < 0.5');
  });

  it("emits only the path that has steps", () => {
    const { source } = compileSpec(study(branch({ otherwise: [] })), schemas);
    expect(source.match(/conditional_function/g)).toHaveLength(1);
  });

  it("rejects judging trials that only exist inside the branch", () => {
    const spec: Spec = {
      name: "self-judging",
      timeline: [
        {
          kind: "branch",
          when: { scope: "inner", accuracy_at_least: 0.5 },
          then: [
            {
              kind: "trial",
              plugin: "html-keyboard-response",
              tag: "inner",
              params: { stimulus: "hi" },
            },
          ],
        },
      ],
    };
    expect(() => compileSpec(spec, schemas)).toThrow(/no trial before it carries that tag/);
  });

  it("rejects comparing accuracy both ways at once", () => {
    const confused = branch({
      when: { scope: "screening", accuracy_below: 0.5, accuracy_at_least: 0.8 },
    });
    expect(() => compileSpec(study(confused), schemas)).toThrow(/one way, not both/);
  });

  it("rejects a branch with no steps on either path", () => {
    expect(() => compileSpec(study(branch({ then: [], otherwise: [] })), schemas)).toThrow(
      /at least one of its paths/,
    );
  });
});

describe("branching on what a participant answered", () => {
  const onAnswer = (when: Record<string, unknown>) =>
    study(branch({ when: { scope: "screening", ...when } as BranchNode["when"] }));

  it("compares the latest tagged answer as text", () => {
    const { source } = compileSpec(onAnswer({ response_equals: 1 }), schemas);
    expect(source).toContain('filter({ tag: "screening" })');
    expect(source).toContain('String(latest.response ?? "") === "1"');
    expect(source).not.toContain('select("correct")');
    expect(source).toContain("conditional_function: () => !(");
  });

  it("reads one question of a survey", () => {
    const { source } = compileSpec(
      onAnswer({ response_equals: "No", question: "consent" }),
      schemas,
    );
    expect(source).toContain('.response?.["consent"] ?? "") === "No"');
  });

  it("rejects a rule that also compares accuracy", () => {
    expect(() =>
      compileSpec(onAnswer({ response_equals: "no", accuracy_at_least: 0.5 }), schemas),
    ).toThrow(/accuracy or on an answer, not both/);
  });

  it.each([[""], [null], [{ answer: "no" }]])("rejects looking for %j", (answer) => {
    expect(() => compileSpec(onAnswer({ response_equals: answer }), schemas)).toThrow(
      /needs the answer it looks for/,
    );
  });

  it("rejects naming a survey question with nothing", () => {
    expect(() => compileSpec(onAnswer({ response_equals: "no", question: "" }), schemas)).toThrow(
      /needs that question's name/,
    );
  });

  it("still needs the answer to come from an earlier trial", () => {
    expect(() =>
      compileSpec(study(branch({ when: { scope: "later", response_equals: "no" } })), schemas),
    ).toThrow(/no trial before it carries that tag/);
  });
});
