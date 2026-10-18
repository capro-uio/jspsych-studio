import { describe, expect, it } from "vitest";
import { codeProblem } from "../src/code.ts";
import { compileSpec } from "../src/compile.ts";
import type { ParameterValue, Spec, TrialNode } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const BUTTON = "(choice) => `<button class='jspsych-btn'>${choice}</button>`";

function study(trial: Omit<TrialNode, "kind">, extra: Partial<Spec> = {}): Spec {
  return { name: "coded", ...extra, timeline: [{ kind: "trial", ...trial }] };
}

function buttons(button_html: ParameterValue) {
  return study({
    plugin: "html-button-response",
    params: { stimulus: "<p>pick</p>", choices: ["a", "b"], button_html },
  });
}

describe("code as a parameter value", () => {
  it("hands a parameter that takes a function the code itself", () => {
    const { source } = compileSpec(buttons({ code: BUTTON }), schemas);
    expect(source).toContain(`button_html: (${BUTTON}\n)`);
  });

  it("works out any other parameter when the trial starts", () => {
    const { source } = compileSpec(
      study({
        plugin: "html-keyboard-response",
        params: { stimulus: { code: "`<p>${1 + 1}</p>`" } },
      }),
      schemas,
    );
    expect(source).toContain("stimulus: () => (`<p>${1 + 1}</p>`\n)");
  });

  it("looks up a computed file name among the added files", () => {
    const { source } = compileSpec(
      study(
        { plugin: "image-keyboard-response", params: { stimulus: { code: '"face.png"' } } },
        { assets: [{ name: "face.png", url: "data:image/png;base64,AA==" }] },
      ),
      schemas,
    );
    expect(source).toContain('stimulus: () => asset(("face.png"\n))');
  });

  it("builds a list when the trial starts once an entry computes a field", () => {
    const { source } = compileSpec(
      study({
        plugin: "survey-likert",
        params: { questions: [{ prompt: { code: '"How " + "sure?"' }, labels: ["no", "yes"] }] },
      }),
      schemas,
    );
    expect(source).toContain('questions: () => [{ "prompt": ("How " + "sure?"\n), ');
  });

  it("keeps an entry's function field a function rather than calling it", () => {
    const { source } = compileSpec(
      study({
        plugin: "psychophysics",
        params: {
          stimuli: [
            {
              obj_type: "circle",
              radius: 20,
              fill_color: "red",
              change_attr: { code: "(stimulus, elapsed) => {}" },
            },
          ],
        },
      }),
      schemas,
    );
    expect(source).toContain('"change_attr": ((stimulus, elapsed) => {}\n)');
    expect(source).not.toContain("stimuli: () =>");
  });

  it("rejects text where a parameter takes a function", () => {
    expect(() => compileSpec(buttons(BUTTON), schemas)).toThrow(
      /parameter "button_html" takes a function, written as code/,
    );
  });

  it("rejects a column where a parameter takes a function", () => {
    expect(() => compileSpec(buttons({ var: "button" }), schemas)).toThrow(
      /parameter "button_html" takes a function/,
    );
  });

  it("rejects text in an entry's function field", () => {
    expect(() =>
      compileSpec(
        study({
          plugin: "psychophysics",
          params: {
            stimuli: [{ obj_type: "circle", radius: 20, fill_color: "red", change_attr: "grow()" }],
          },
        }),
        schemas,
      ),
    ).toThrow(/entry 1, field "change_attr" takes a function/);
  });

  it("rejects code in a recorded field", () => {
    expect(() =>
      compileSpec(
        study({
          plugin: "html-keyboard-response",
          params: { stimulus: "<p>hi</p>" },
          record: { when: { code: "Date.now()" } } as never,
        }),
        schemas,
      ),
    ).toThrow(/recorded field "when" holds code/);
  });

  it("rejects code with fields beside it", () => {
    expect(() => compileSpec(buttons({ code: BUTTON, lang: "js" } as never), schemas)).toThrow(
      /holds code alongside "lang"/,
    );
  });

  it("rejects code inside a plain list, which would reach the plugin as an object", () => {
    expect(() =>
      compileSpec(
        study({
          plugin: "html-button-response",
          params: { stimulus: "<p>pick</p>", choices: [{ code: '"a"' }, "b"] },
        }),
        schemas,
      ),
    ).toThrow(/parameter "choices" holds code inside it/);
  });

  it("rejects code nested inside an entry's field", () => {
    expect(() =>
      compileSpec(
        study({
          plugin: "survey-likert",
          params: { questions: [{ prompt: "sure?", labels: [{ code: '"no"' }, "yes"] }] },
        }),
        schemas,
      ),
    ).toThrow(/entry 1, field "labels" holds code inside it/);
  });

  it("names the parameter whose code does not parse", () => {
    expect(() => compileSpec(buttons({ code: "(choice) =>" }), schemas)).toThrow(
      /parameter "button_html" holds code that is not valid JavaScript/,
    );
  });
});

describe("checking a piece of code", () => {
  it("accepts an expression with a trailing line comment", () => {
    expect(codeProblem("(x) => x // echo")).toBeNull();
  });

  it("accepts a function whose body spans several statements", () => {
    expect(codeProblem("() => {\n  const n = 2;\n  return n * n;\n}")).toBeNull();
  });

  it.each(["", "   "])("rejects empty code %j", (code) => {
    expect(codeProblem(code)).toBe("holds no code");
  });

  it("rejects code that is not text", () => {
    expect(codeProblem(42)).toBe("holds no code");
  });

  // Closing the parenthesis the compiler adds would put statements beside the parameter.
  it("rejects code that tries to close its own parentheses", () => {
    expect(codeProblem("1); alert(2); (3")).toBe("should be a single JavaScript expression");
  });

  it.each(["'</script>'", "'</SCRIPT >'", "'<!--'"])(
    "rejects %s, which would end an inline script",
    (code) => {
      expect(codeProblem(code)).toMatch(/would end the page's script early/);
    },
  );
});
