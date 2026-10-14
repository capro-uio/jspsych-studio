import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { SpecError } from "../src/validate.ts";
import type { Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const flanker = JSON.parse(
  readFileSync(new URL("../../../examples/flanker.json", import.meta.url), "utf8"),
) as Spec;

describe("compileSpec", () => {
  it("collects the plugins the timeline needs", () => {
    expect(compileSpec(flanker, schemas).plugins).toEqual(["html-keyboard-response"]);
  });

  it("reads timeline variables inside functions with evaluateTimelineVariable", () => {
    const { source } = compileSpec(flanker, schemas);
    const functionLines = source
      .split("\n")
      .filter((line) => line.includes("=>") && /timelinevariable/i.test(line));

    expect(functionLines.length).toBeGreaterThan(0);
    for (const line of functionLines) {
      expect(line).not.toMatch(/(?<!evaluate)TimelineVariable/i);
    }
  });

  it("scores responses against a timeline variable", () => {
    const { source } = compileSpec(flanker, schemas);
    expect(source).toContain(
      'data.correct = data.response === jsPsych.evaluateTimelineVariable("correct_key")',
    );
  });

  it("passes plain parameters straight through as timeline variables", () => {
    const spec: Spec = {
      name: "direct",
      conditions: { rows: [{ word: "RED" }] },
      timeline: [
        {
          kind: "block",
          conditions: "rows",
          children: [
            {
              kind: "trial",
              plugin: "html-keyboard-response",
              params: { stimulus: { var: "word" } },
            },
          ],
        },
      ],
    };
    expect(compileSpec(spec, schemas).source).toContain(
      'stimulus: jsPsych.timelineVariable("word")',
    );
  });
});

describe("validateSpec", () => {
  const trial = (params: Record<string, unknown>) =>
    ({
      name: "invalid",
      timeline: [{ kind: "trial", plugin: "html-keyboard-response", params }],
    }) as Spec;

  it("rejects a missing required parameter", () => {
    expect(() => compileSpec(trial({ choices: ["f"] }), schemas)).toThrow(
      /requires parameter "stimulus"/,
    );
  });

  it("rejects a parameter the plugin does not have", () => {
    expect(() => compileSpec(trial({ stimulus: "hi", stimulsu: 1 }), schemas)).toThrow(
      /no parameter "stimulsu"/,
    );
  });

  it("rejects an experiment with no steps", () => {
    expect(() => compileSpec({ name: "empty", timeline: [] }, schemas)).toThrow(
      /timeline has no steps/,
    );
  });

  it("rejects a container with nothing inside it", () => {
    const spec = {
      name: "hollow",
      conditions: { rows: [{ word: "RED" }] },
      timeline: [{ kind: "block", conditions: "rows", children: [] }],
    } as Spec;
    expect(() => compileSpec(spec, schemas)).toThrow(/block has no steps inside it/);
  });

  it("rejects an unknown plugin", () => {
    const spec = { name: "x", timeline: [{ kind: "trial", plugin: "not-a-plugin" }] } as Spec;
    expect(() => compileSpec(spec, schemas)).toThrow(SpecError);
  });

  it("rejects a bound parameter whose column no enclosing table provides", () => {
    const spec: Spec = {
      name: "dangling",
      conditions: { rows: [{ word: "RED" }] },
      timeline: [
        {
          kind: "block",
          conditions: "rows",
          children: [
            {
              kind: "trial",
              plugin: "html-keyboard-response",
              params: { stimulus: { var: "wrod" } },
            },
          ],
        },
      ],
    };
    expect(() => compileSpec(spec, schemas)).toThrow(/reads column "wrod"/);
  });

  it("rejects a scoring rule reading a column that does not exist", () => {
    const spec: Spec = {
      name: "dangling-score",
      conditions: { rows: [{ word: "RED" }] },
      timeline: [
        {
          kind: "block",
          conditions: "rows",
          children: [
            {
              kind: "trial",
              plugin: "html-keyboard-response",
              params: { stimulus: { var: "word" } },
              score: { correct_if_response_equals: { var: "answer" } },
            },
          ],
        },
      ],
    };
    expect(() => compileSpec(spec, schemas)).toThrow(/scoring rule reads column "answer"/);
  });

  it("rejects a loop whose tag no trial inside it carries", () => {
    const spec: Spec = {
      name: "unreachable-loop",
      timeline: [
        {
          kind: "loop",
          repeat_while: { accuracy_below: 0.8, scope: "praktice" },
          children: [
            {
              kind: "trial",
              plugin: "html-keyboard-response",
              tag: "practice",
              params: { stimulus: "hi" },
            },
          ],
        },
      ],
    };
    expect(() => compileSpec(spec, schemas)).toThrow(/would never repeat/);
  });

  it("rejects a literal of the wrong type for a numeric parameter", () => {
    const spec = {
      name: "wrong-type",
      timeline: [
        {
          kind: "trial",
          plugin: "html-keyboard-response",
          params: { stimulus: "hi", trial_duration: "" },
        },
      ],
    } as Spec;
    expect(() => compileSpec(spec, schemas)).toThrow(/expects int/);
  });

  it("rejects a block whose conditions table is undefined", () => {
    const spec = {
      name: "x",
      timeline: [{ kind: "block", conditions: "missing", children: [] }],
    } as Spec;
    expect(() => compileSpec(spec, schemas)).toThrow(/does not define/);
  });
});
