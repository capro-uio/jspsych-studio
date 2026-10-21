import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileSpec, STEP_COLUMN } from "../src/compile.ts";
import { SpecError } from "../src/validate.ts";
import type { Spec, TrialNode } from "../src/types.ts";
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
      'data.correct = String(data.response) === String(jsPsych.evaluateTimelineVariable("correct_key"))',
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

  it("names the step the way the builder does, and the plugin the way the spec does", () => {
    expect(() => compileSpec(trial({ choices: ["f"] }), schemas)).toThrow(
      'step "Text, answered with a key" (html-keyboard-response) requires parameter "stimulus"',
    );
  });

  it("rejects a scoring rule on a step that scores its answers itself", () => {
    const sorting: Spec = {
      name: "sorting",
      timeline: [
        {
          kind: "trial",
          plugin: "categorize-html",
          params: { stimulus: "<p>a</p>", key_answer: "f" },
          score: { correct_if_response_equals: "f" },
        },
      ],
    };
    expect(() => compileSpec(sorting, schemas)).toThrow(
      /scores its answers itself, so it takes no scoring rule/,
    );
  });

  describe("a scoring rule on a step that records several answers together", () => {
    const scored = (plugin: string, params: Record<string, unknown>): Spec => ({
      name: "scored",
      timeline: [
        {
          kind: "trial",
          plugin,
          params: params as TrialNode["params"],
          score: { correct_if_response_equals: "cat" },
        },
      ],
    });

    it.each([
      ["maxdiff", { alternatives: ["a", "b"], labels: ["least", "most"] }],
      ["survey-multi-select", { questions: [{ prompt: "Pets?", options: ["cat", "dog"] }] }],
      ["survey-html-form", { html: '<input name="age">' }],
    ])("is refused on %s", (plugin, params) => {
      expect(() => compileSpec(scored(plugin, params), schemas)).toThrow(
        /records several answers together, so a scoring rule, which compares a single answer, never matches/,
      );
    });

    it("is refused on fill in the blanks with more than one gap", () => {
      const spec = scored("cloze", { text: "<p>The %cat% sat on the %mat%.</p>" });
      expect(() => compileSpec(spec, schemas)).toThrow(/only works with one gap/);
    });

    it("is taken on fill in the blanks with one gap, whose list of one reads as its answer", () => {
      const spec = scored("cloze", { text: "<p>The %cat% sat.</p>" });
      expect(() => compileSpec(spec, schemas)).not.toThrow();
    });
  });

  const sorting = (params: Record<string, unknown>, plugin = "categorize-html"): Spec => ({
    name: "sorting",
    timeline: [{ kind: "trial", plugin, params: { stimulus: "<p>a</p>", ...params } }],
  });

  it("rejects a right answer no participant can press", () => {
    expect(() => compileSpec(sorting({ key_answer: "f", choices: ["a", "l"] }), schemas)).toThrow(
      /takes "f" as the right answer, but only "a", "l" can be pressed/,
    );
  });

  it("accepts a right answer among the keys, whatever its case, or with every key allowed", () => {
    expect(() =>
      compileSpec(sorting({ key_answer: "F", choices: ["f", "j"] }), schemas),
    ).not.toThrow();
    expect(() => compileSpec(sorting({ key_answer: "f" }), schemas)).not.toThrow();
  });

  it("rejects one key for both same and different, counting the plugin's own defaults", () => {
    const pair = (params: Record<string, unknown>): Spec => ({
      name: "pair",
      timeline: [
        {
          kind: "trial",
          plugin: "same-different-html",
          params: { stimuli: ["<p>A</p>", "<p>A</p>"], answer: "same", ...params },
        },
      ],
    });
    expect(() => compileSpec(pair({ different_key: "Q" }), schemas)).toThrow(
      /uses "q" for both same_key and different_key/,
    );
    expect(() => compileSpec(pair({}), schemas)).not.toThrow();
  });

  it.each([[["<p>A</p>"]], [["<p>A</p>", "<p>B</p>", "<p>C</p>"]]])(
    "rejects a same/different pair that is not a pair: %j",
    (stimuli) => {
      const pair: Spec = {
        name: "pair",
        timeline: [
          { kind: "trial", plugin: "same-different-html", params: { stimuli, answer: "same" } },
        ],
      };
      expect(() => compileSpec(pair, schemas)).toThrow(
        /parameter "stimuli" takes exactly 2 entries/,
      );
    },
  );

  it("rejects most-and-least labels that are not one for each end", () => {
    const ranking: Spec = {
      name: "ranking",
      timeline: [
        {
          kind: "trial",
          plugin: "maxdiff",
          params: { alternatives: ["a", "b", "c"], labels: ["least", "middle", "most"] },
        },
      ],
    };
    expect(() => compileSpec(ranking, schemas)).toThrow(
      /parameter "labels" takes exactly 2 entries/,
    );
  });

  it("rejects a pair of images that is not a pair", () => {
    const pair: Spec = {
      name: "pair",
      assets: [{ name: "a.png", url: "data:image/png;base64,AA==" }],
      timeline: [
        {
          kind: "trial",
          plugin: "same-different-image",
          params: { stimuli: ["a.png"], answer: "same" },
        },
      ],
    };
    expect(() => compileSpec(pair, schemas)).toThrow(/parameter "stimuli" takes exactly 2 entries/);
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
    expect(() => compileSpec(spec, schemas)).toThrow(/expects a number/);
  });

  it("rejects a block whose conditions table is undefined", () => {
    const spec = {
      name: "x",
      timeline: [{ kind: "block", conditions: "missing", children: [] }],
    } as Spec;
    expect(() => compileSpec(spec, schemas)).toThrow(/does not define/);
  });
});

describe("warnings", () => {
  const unending = {
    kind: "trial" as const,
    plugin: "sketchpad",
    params: { show_finished_button: false },
  };
  const unnamed = {
    kind: "trial" as const,
    plugin: "html-keyboard-response",
    params: {},
  };

  it("never stop a study from being built, and say which step they are about", () => {
    const { source, warnings } = compileSpec({ name: "w", timeline: [unending] }, schemas);
    expect(source).toContain("jsPsychSketchpad");
    expect(warnings.map(({ path, severity }) => ({ path, severity }))).toEqual([
      { path: [0], severity: "warning" },
    ]);
    expect(warnings[0].message).toMatch(/^step "[^"]+" \(sketchpad\) has nothing to end it/);
  });

  it("are none for a study with nothing to question", () => {
    expect(compileSpec(flanker, schemas).warnings).toEqual([]);
  });

  it("travel with the errors that stop a study, but are not counted among them", () => {
    let thrown: SpecError | undefined;
    try {
      compileSpec({ name: "both", timeline: [unending, unnamed] }, schemas);
    } catch (error) {
      thrown = error as SpecError;
    }
    expect(thrown?.problems.map((problem) => problem.severity)).toEqual(["warning", "error"]);
    expect(thrown?.message).toMatch(/^both: 1 problem\(s\)\n {2}- step .* requires parameter/);
    expect(thrown?.message).not.toContain("nothing to end it");
  });
});

describe("tracing steps", () => {
  const spec = (): Spec => ({
    name: "traced",
    timeline: [
      { kind: "trial", plugin: "html-keyboard-response", params: { stimulus: "+" } },
      {
        kind: "trial",
        plugin: "html-keyboard-response",
        tag: "word",
        params: { stimulus: "RED" },
      },
    ],
  });

  it("names a step in its data when asked to", () => {
    const traced = spec();
    const stepIds = new Map([[traced.timeline[1] as TrialNode, "1"]]);
    const { source } = compileSpec(traced, schemas, { stepIds });
    expect(source).toContain(`data: { tag: "word", ${STEP_COLUMN}: "1" }`);
    expect(source.match(new RegExp(STEP_COLUMN, "g"))).toHaveLength(1);
  });

  it("leaves an exported study's data as the author wrote it", () => {
    expect(compileSpec(spec(), schemas).source).not.toContain(STEP_COLUMN);
  });
});
