import { describe, expect, it } from "vitest";
import type { SpecNode } from "@jspsych-studio/compiler";
import { codeHint, codeSeed, usesCode } from "../src/lib/code.ts";
import { editableParameters, schemas, startingParams } from "../src/lib/schemas.ts";

const parameterOf = (plugin: string, name: string) => schemas.plugins[plugin].properties[name];

describe("codeSeed", () => {
  it("starts a function from the plugin's own default", () => {
    expect(codeSeed(parameterOf("html-button-response", "button_html"), undefined)).toMatch(
      /^function\(choice, choice_index\) \{\n {2}return `<button class="jspsych-btn">/,
    );
  });

  it("starts a function with no default from an empty one", () => {
    expect(codeSeed(parameterOf("call-function", "func"), undefined)).toBe("() => {\n}");
  });

  it("writes the value a parameter holds as code", () => {
    const duration = parameterOf("html-keyboard-response", "trial_duration");
    expect(codeSeed(duration, 500)).toBe("500");
    expect(codeSeed(parameterOf("html-keyboard-response", "stimulus"), "<p>hi</p>")).toBe(
      '"<p>hi</p>"',
    );
  });

  it("reads the column a parameter was bound to", () => {
    expect(codeSeed(parameterOf("html-keyboard-response", "stimulus"), { var: "word" })).toBe(
      'jsPsych.evaluateTimelineVariable("word")',
    );
  });

  it("falls back to the parameter's default when it holds nothing", () => {
    expect(codeSeed(parameterOf("html-keyboard-response", "response_ends_trial"), undefined)).toBe(
      "true",
    );
  });
});

describe("codeHint", () => {
  it("tells a function from an expression", () => {
    expect(codeHint(parameterOf("call-function", "func"))).toMatch(/function the plugin calls/);
    expect(codeHint(parameterOf("html-keyboard-response", "stimulus"))).toMatch(
      /expression worked out when the trial starts/,
    );
  });
});

describe("usesCode", () => {
  const coded: SpecNode = {
    kind: "trial",
    plugin: "html-keyboard-response",
    params: { stimulus: { code: '"<p>hi</p>"' } },
  };
  const plain: SpecNode = {
    kind: "trial",
    plugin: "html-keyboard-response",
    params: { stimulus: "<p>hi</p>" },
  };

  it("finds code in a step's parameters", () => {
    expect(usesCode(coded)).toBe(true);
    expect(usesCode(plain)).toBe(false);
  });

  it("finds code in a list entry's field", () => {
    const stimuli = [{ obj_type: "circle", change_attr: { code: "() => {}" } }];
    expect(usesCode({ kind: "trial", plugin: "psychophysics", params: { stimuli } })).toBe(true);
  });

  it("finds code in a step nested inside a block or a branch", () => {
    expect(usesCode({ kind: "block", conditions: "words", children: [plain, coded] })).toBe(true);
    expect(
      usesCode({
        kind: "branch",
        when: { scope: "consent", response_equals: "n" },
        then: [plain],
        otherwise: [coded],
      }),
    ).toBe(true);
    expect(usesCode({ kind: "loop", repeat_while: { scope: "x" }, children: [plain] })).toBe(false);
  });
});

describe("parameters that take a function", () => {
  it("are offered in the form", () => {
    const names = editableParameters("html-button-response").map(({ name }) => name);
    expect(names).toContain("button_html");
  });

  it("start as code when a plugin requires one", () => {
    expect(startingParams("call-function")).toEqual({ func: { code: "() => {\n}" } });
  });
});
