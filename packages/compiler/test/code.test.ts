import { describe, expect, it } from "vitest";
import { codeProblem } from "../src/code.ts";
import { compileSpec } from "../src/compile.ts";
import { sourceHeader } from "../src/metadata.ts";
import { emitHtml } from "../src/targets/html.ts";
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

  it("takes null for a function parameter, as jsPsych's defaults do", () => {
    expect(() => compileSpec(buttons(null), schemas)).not.toThrow();
  });

  it("looks up each file of a list built by code", () => {
    const files = ["a.png", "b.png"].map((name) => ({
      name,
      url: `data:image/png;base64,${name}`,
    }));
    const { source } = compileSpec(
      study(
        { plugin: "preload", params: { images: { code: '["a.png", "b.png"]' } } },
        { assets: files },
      ),
      schemas,
    );
    expect(source).toContain("Array.isArray(name) ? name.map(asset)");
    expect(source).toContain('images: () => asset((["a.png", "b.png"]\n))');
  });

  it("looks up a file computed inside a list entry", () => {
    const { source } = compileSpec(
      study(
        {
          plugin: "psychophysics",
          params: {
            stimuli: [{ obj_type: "image", file: { code: '"face.png"' } }],
          },
        },
        { assets: [{ name: "face.png", url: "data:image/png;base64,AA==" }] },
      ),
      schemas,
    );
    expect(source).toContain(
      'stimuli: () => [{ "obj_type": "image", "file": asset(("face.png"\n)) }]',
    );
  });

  it("computes keys and options like any other value", () => {
    const { source } = compileSpec(
      study({
        plugin: "html-keyboard-response",
        params: { stimulus: "<p>hi</p>", choices: { code: '["f", "j"]' } },
      }),
      schemas,
    );
    expect(source).toContain('choices: () => (["f", "j"]\n)');
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
  it.each(["1); alert(2); (3", "a), (b", "a)(b"])(
    "rejects code that closes the parentheses it is written into: %s",
    (code) => {
      expect(codeProblem(code)).toBe("should be a single JavaScript expression");
    },
  );

  it("accepts code that opens and closes parentheses of its own", () => {
    expect(codeProblem("(a), (b)")).toBeNull();
  });

  it("rejects a line starting with -->, which the formatter cannot read", () => {
    expect(codeProblem("x\n--> note")).toMatch(/starts a line with "-->"/);
  });

  it.each(["'</script>'", "'</SCRIPT >'", "'<!--'"])(
    "rejects %s, which would end an inline script",
    (code) => {
      expect(codeProblem(code)).toMatch(/would end the page's script early/);
    },
  );
});

// Code is meant to reach a study only as a code value, which the builder marks; anything else a
// spec holds is written into the experiment as data.
describe("values that are not code cannot become code", () => {
  const trial = (extra: Partial<TrialNode>): TrialNode => ({
    kind: "trial",
    plugin: "html-keyboard-response",
    tag: "practice",
    params: { stimulus: "<p>hi</p>" },
    ...extra,
  });

  it("writes a recorded field's name as text", () => {
    const name = "x: (globalThis.ran = true), y";
    const { source } = compileSpec(
      { name: "coded", timeline: [trial({ record: { [name]: "v" } })] },
      schemas,
    );
    expect(source).toContain(`data: { tag: "practice", ${JSON.stringify(name)}: "v" }`);
  });

  it("rejects repetitions that are not a whole number", () => {
    const spec = {
      name: "coded",
      conditions: { words: [{ word: "a" }] },
      timeline: [
        {
          kind: "block",
          conditions: "words",
          repetitions: "1, on_start: () => (globalThis.ran = true)",
          children: [trial({})],
        },
      ],
    } as unknown as Spec;
    expect(() => compileSpec(spec, schemas)).toThrow(/a block repeats .* not a whole number/);
  });

  it.each(["loop", "branch"])("rejects a %s threshold that is not a number", (kind) => {
    const rule = { scope: "practice", accuracy_below: "0 || (globalThis.ran = true)" };
    const node =
      kind === "loop"
        ? { kind: "loop", repeat_while: rule, children: [trial({})] }
        : { kind: "branch", when: rule, then: [trial({ tag: undefined })] };
    const spec = {
      name: "coded",
      timeline: kind === "loop" ? [node] : [trial({}), node],
    } as unknown as Spec;
    expect(() => compileSpec(spec, schemas)).toThrow(/compares accuracy with .* not a number/);
  });

  it.each(["data", "on_finish"])("rejects code in %s, which the study sets itself", (name) => {
    expect(() =>
      compileSpec(
        study({
          plugin: "html-keyboard-response",
          params: { stimulus: "<p>hi</p>", [name]: { code: "1); (globalThis.ran = true); (2" } },
        }),
        schemas,
      ),
    ).toThrow(new RegExp(`parameter "${name}" holds code, but the study sets "${name}" itself`));
  });

  it.each(["background_color", "text_color"])("rejects a %s that is not a colour", (key) => {
    const spec = study(
      { plugin: "html-keyboard-response", params: { stimulus: "<p>hi</p>" } },
      { settings: { [key]: "red; } </style><script>globalThis.ran = true</script>" } },
    );
    expect(() => compileSpec(spec, schemas)).toThrow(new RegExp(`${key} is .* not a colour`));
  });

  it.each(["#fafafa", "white", "rgb(10, 20, 30)", "hsl(120deg 50% 50%)"])(
    "accepts the colour %s",
    (color) => {
      const spec = study(
        { plugin: "html-keyboard-response", params: { stimulus: "<p>hi</p>" } },
        { settings: { background_color: color } },
      );
      expect(() => compileSpec(spec, schemas)).not.toThrow();
    },
  );

  it("keeps a study's name from closing the comment it is written into", () => {
    const header = sourceHeader(
      { name: "x */ globalThis.ran = true; /*", timeline: [] },
      { jspsych: "8.3.0", generatedAt: "2026-01-01" },
    );
    expect(header.match(/\*\//g)).toHaveLength(1);
  });
});

describe("code in the page", () => {
  it("keeps a multi-line template literal's text as written", async () => {
    const result = compileSpec(
      study({
        plugin: "html-keyboard-response",
        params: { stimulus: { code: "`<p>one\ntwo</p>`" } },
      }),
      schemas,
    );
    const { html } = await emitHtml(result, { title: "coded" });
    expect(html).toContain("`<p>one\ntwo</p>`");
  });
});
