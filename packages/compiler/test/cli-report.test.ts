import { describe, expect, it } from "vitest";
import { compileReport } from "../src/cli-report.ts";
import { compileSpec } from "../src/compile.ts";
import type { Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const study = (params: Record<string, boolean>): Spec => ({
  name: "drawing",
  timeline: [{ kind: "trial", plugin: "sketchpad", params }],
});

describe("what the command line says once a study is built", () => {
  it("prints each warning on a line of its own, marked as a warning", () => {
    const result = compileSpec(study({ show_finished_button: false }), schemas);
    const { warnings } = compileReport("drawing", result, "drawing.html");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^warning: step "[^"]+" \(sketchpad\) has nothing to end it/);
  });

  it("prints no warnings for a study with nothing to question", () => {
    const result = compileSpec(study({}), schemas);
    expect(compileReport("drawing", result, "drawing.html").warnings).toEqual([]);
  });

  it("says how many plugins the page uses and where it went", () => {
    const result = compileSpec(study({}), schemas);
    expect(compileReport("drawing", result, "out/drawing.html").summary).toBe(
      "drawing: 1 plugin(s) -> out/drawing.html",
    );
  });
});
