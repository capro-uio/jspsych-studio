import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import { STUDY_COLUMNS } from "../src/data.ts";
import { specSchema } from "../src/spec-schema.ts";
import { validateSpec } from "../src/validate.ts";
import type { Spec, SpecNode, TrialNode } from "../src/types.ts";
import { schemas } from "./schemas.ts";

// The validator states a few of the schema's rules again, in words a researcher can act on. Each
// rule is tried at its edges here, and the two must agree, so neither drifts from the other.
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const schemaAccepts = ajv.compile(specSchema(schemas.plugins));

function validatorAccepts(spec: Spec) {
  try {
    validateSpec(spec, schemas.plugins);
    return true;
  } catch {
    return false;
  }
}

const practice: TrialNode = {
  kind: "trial",
  plugin: "html-keyboard-response",
  tag: "practice",
  params: { stimulus: "<p>hi</p>" },
};

const study = (timeline: SpecNode[], extra: Partial<Spec> = {}): Spec => ({
  name: "agreement",
  conditions: { words: [{ word: "a" }] },
  timeline,
  ...extra,
});

function agreeOn(cases: [unknown, boolean][], build: (value: unknown) => Spec) {
  for (const [value, valid] of cases) {
    const spec = build(value);
    expect({ value, schema: schemaAccepts(spec) }).toEqual({ value, schema: valid });
    expect({ value, validator: validatorAccepts(spec) }).toEqual({ value, validator: valid });
  }
}

describe("the validator and the spec schema agree", () => {
  it("on how often a block repeats", () => {
    agreeOn(
      [
        [1, true],
        [3, true],
        [0, false],
        [-1, false],
        [1.5, false],
        ["2", false],
      ],
      (repetitions) =>
        study([{ kind: "block", conditions: "words", repetitions, children: [practice] } as never]),
    );
  });

  it.each(["accuracy_below", "accuracy_at_least"])("on a loop's %s", (key) => {
    agreeOn(
      [
        [0, true],
        [0.75, true],
        [1, true],
        [-0.1, false],
        [1.1, false],
        ["0.5", false],
      ],
      (threshold) =>
        study([
          {
            kind: "loop",
            repeat_while: { scope: "practice", [key]: threshold },
            children: [practice],
          } as never,
        ]),
    );
  });

  it("on a branch's threshold", () => {
    agreeOn(
      [
        [0.5, true],
        [2, false],
        ["0.5", false],
      ],
      (threshold) =>
        study([
          practice,
          {
            kind: "branch",
            when: { scope: "practice", accuracy_below: threshold },
            then: [{ ...practice, tag: undefined }],
          } as never,
        ]),
    );
  });

  it.each(["background_color", "text_color"])("on what counts as a colour in %s", (key) => {
    agreeOn(
      [
        ["#fff", true],
        ["#0a0a0aff", true],
        ["white", true],
        ["rgb(10, 20, 30)", true],
        ["hsl(120deg 50% 50%)", true],
        ["", false],
        ["red; }", false],
        ["url(x)", false],
        [3, false],
      ],
      (color) => study([practice], { settings: { [key]: color } }),
    );
  });

  it("on code in a parameter that takes a function", () => {
    agreeOn(
      [
        [{ code: "(choice) => choice" }, true],
        [null, true],
        [{ code: "" }, false],
        ["<button>%choice%</button>", false],
        [{ var: "word" }, false],
      ],
      (button_html) =>
        study([
          {
            kind: "trial",
            plugin: "html-button-response",
            params: { stimulus: "<p>pick</p>", choices: ["a"], button_html },
          } as never,
        ]),
    );
  });

  it("on the options a parameter takes", () => {
    agreeOn(
      [
        ["circle", true],
        ["cross", true],
        ["hexagon", false],
      ],
      (obj_type) =>
        study([
          {
            kind: "trial",
            plugin: "psychophysics",
            params: {
              stimuli: [{ obj_type, radius: 20, line_length: 20, fill_color: "red" }],
            },
          } as never,
        ]),
    );
  });

  it.each([
    ["slider_width", null, true],
    ["slider_width", 400, true],
    ["min", null, false],
    ["min", 0, true],
  ])(
    "on %s holding %j, null being jsPsych's none only where it is the default",
    (name, value, valid) => {
      agreeOn([[value, valid]], (held) =>
        study([
          {
            kind: "trial",
            plugin: "html-slider-response",
            params: { stimulus: "<p>how sure?</p>", [name]: held },
          } as never,
        ]),
      );
    },
  );

  it("on a scoring rule, which a step that scores itself does not take", () => {
    const scored = (plugin: string) =>
      study([
        {
          kind: "trial",
          plugin,
          params: {
            stimulus: "<p>a</p>",
            ...(plugin === "categorize-html" && { key_answer: "f" }),
          },
          score: { correct_if_response_equals: "f" },
        } as never,
      ]);
    expect([
      schemaAccepts(scored("categorize-html")),
      validatorAccepts(scored("categorize-html")),
    ]).toEqual([false, false]);
    expect([
      schemaAccepts(scored("html-keyboard-response")),
      validatorAccepts(scored("html-keyboard-response")),
    ]).toEqual([true, true]);
  });

  it("on how many stimuli a same/different pair takes", () => {
    agreeOn(
      [
        [["<p>A</p>", "<p>A</p>"], true],
        [["<p>A</p>"], false],
        [["<p>A</p>", "<p>A</p>", "<p>A</p>"], false],
      ],
      (stimuli) =>
        study([
          {
            kind: "trial",
            plugin: "same-different-html",
            params: { stimuli, answer: "same" },
          } as never,
        ]),
    );
  });

  it("on the columns a study writes itself", () => {
    agreeOn(
      [["word_shown", true], ...STUDY_COLUMNS.map((column): [string, boolean] => [column, false])],
      (column) => study([{ ...practice, record: { [column as string]: "x" } }]),
    );
  });
});
