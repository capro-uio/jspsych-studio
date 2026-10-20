import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { emitHtml } from "../src/targets/html.ts";
import { DEFAULT_BACKGROUND, backgroundColor, textColor } from "../src/appearance.ts";
import type { Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const spec = (settings: Spec["settings"]): Spec => ({
  name: "appearance",
  settings,
  timeline: [{ kind: "trial", plugin: "html-keyboard-response", params: { stimulus: "hi" } }],
});

describe("how the experiment looks", () => {
  it("adds no styling when nothing is chosen", async () => {
    const compiled = compileSpec(spec(undefined), schemas);
    expect(compiled.styles).toBe("");
    const { html } = await emitHtml(compiled, { title: "appearance" });
    expect(html).not.toContain("<style>");
  });

  it("reports the defaults jsPsych already uses", () => {
    expect(backgroundColor(undefined)).toBe(DEFAULT_BACKGROUND);
    expect(textColor(undefined)).toBe("#000000");
    expect(backgroundColor({ background_color: "#101014" })).toBe("#101014");
  });

  it("puts the chosen colours in the page", async () => {
    const compiled = compileSpec(
      spec({ background_color: "#101014", text_color: "#eeeeee" }),
      schemas,
    );
    const { html } = await emitHtml(compiled, { title: "appearance" });
    expect(html).toContain("background-color: #101014");
    expect(html).toContain("color: #eeeeee");
    expect(html.indexOf("<style>")).toBeLessThan(html.indexOf("<script"));
  });

  it("falls back to the defaults for a colour that could break out of where it is written", () => {
    const settings = {
      background_color: 'red;}</style><script>alert(1)</script><style>{"',
      text_color: '#fff" onload="alert(1)',
    };
    expect(backgroundColor(settings)).toBe(DEFAULT_BACKGROUND);
    expect(textColor(settings)).toBe("#000000");
    expect(textColor({ text_color: "rgb(10, 20, 30)" })).toBe("rgb(10, 20, 30)");
  });

  it("states the text colour on the element jsPsych colours itself", () => {
    const compiled = compileSpec(spec({ text_color: "#eeeeee" }), schemas);
    expect(compiled.styles).toContain(".jspsych-content");
  });
});
