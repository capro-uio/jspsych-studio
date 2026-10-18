import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { questionNames } from "../src/conditions.ts";
import type { BranchNode, Spec, TrialNode } from "../src/types.ts";
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

  const survey = {
    kind: "trial" as const,
    plugin: "survey-multi-select",
    tag: "consent",
    params: {
      questions: [
        { prompt: "Agree?", name: "consent", options: ["Yes", "No"] },
        { prompt: "And?", options: ["a", "b"] },
      ],
    },
  };
  const onSurvey = (when: Record<string, unknown>): Spec => ({
    name: "routing",
    timeline: [survey, branch({ when: { scope: "consent", ...when } as BranchNode["when"] })],
  });

  it("compares the latest tagged answer as text", () => {
    const { source } = compileSpec(onAnswer({ response_equals: 1 }), schemas);
    expect(source).toContain('filter({ tag: "screening" })');
    expect(source).toContain("const answer = latest === undefined ? undefined : latest.response;");
    expect(source).toContain('String(answer ?? "") === "1"');
    expect(source).not.toContain('select("correct")');
    expect(source).toContain("conditional_function: () => !(");
  });

  it("reads one question of a survey", () => {
    const { source } = compileSpec(
      onSurvey({ response_equals: "No", question: "consent" }),
      schemas,
    );
    expect(source).toContain('latest.response?.["consent"]');
    expect(source).toContain('String(answer ?? "") === "No"');
  });

  it("matches a ticked option among a checkbox question's answers", () => {
    const { source } = compileSpec(
      onSurvey({ response_equals: "No", question: "consent" }),
      schemas,
    );
    expect(source).toContain('Array.isArray(answer) ? answer.map(String).includes("No")');
  });

  it("needs the question a survey's answer is read from, even when it asks one", () => {
    expect(() => compileSpec(onSurvey({ response_equals: "No" }), schemas)).toThrow(
      /a branch on the answers to "consent" needs the question it reads \(questions: consent, Q1\)/,
    );
  });

  it("rejects a question the survey does not ask", () => {
    expect(() =>
      compileSpec(onSurvey({ response_equals: "No", question: "agree" }), schemas),
    ).toThrow(/reads question "agree", which the trials tagged "consent" do not ask/);
  });

  it("rejects a question on trials that ask none", () => {
    expect(() =>
      compileSpec(onAnswer({ response_equals: "no", question: "consent" }), schemas),
    ).toThrow(/reads question "consent", but the trials tagged "screening" ask no questions/);
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

describe("questionNames", () => {
  const asking = (tag: string, questions: unknown) => ({
    kind: "trial" as const,
    plugin: "survey-text",
    tag,
    params: { questions } as TrialNode["params"],
  });

  it("names each question, or numbers it from Q0", () => {
    expect(questionNames([asking("q", [{ name: "age" }, {}, { name: "" }])], "q")).toEqual([
      "age",
      "Q1",
      "Q2",
    ]);
  });

  it("finds tagged question steps inside blocks and paths", () => {
    const nested = {
      kind: "branch" as const,
      when: { scope: "x", accuracy_below: 0.5 },
      then: [{ kind: "block" as const, conditions: "c", children: [asking("q", [{}])] }],
    };
    expect(questionNames([nested], "q")).toEqual(["Q0"]);
  });

  it("knows no names when the questions come from a column", () => {
    expect(questionNames([asking("q", { var: "questions" })], "q")).toEqual([]);
  });

  it("says when the tagged trials ask no questions", () => {
    expect(questionNames([screening], "screening")).toBeNull();
  });
});
