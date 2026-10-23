import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import type { Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const spec = (settings: Spec["settings"]): Spec => ({
  name: "settings",
  settings,
  timeline: [{ kind: "trial", plugin: "html-keyboard-response", params: { stimulus: "hi" } }],
});

describe("experiment-wide settings", () => {
  it("passes nothing to jsPsych when none are set", () => {
    expect(compileSpec(spec(undefined), schemas).source).toContain("initJsPsych()");
  });

  it("carries the settings that are set", () => {
    const { source } = compileSpec(
      spec({ default_iti: 250, show_progress_bar: true, minimum_valid_rt: 100 }),
      schemas,
    );
    expect(source).toContain("default_iti: 250");
    expect(source).toContain("minimum_valid_rt: 100");
    expect(source).toContain("show_progress_bar: true");
  });

  it("keeps caller entries alongside them", () => {
    const { source } = compileSpec(spec({ default_iti: 250 }), schemas, {
      initEntries: "on_finish: () => {}",
    });
    expect(source).toContain("default_iti: 250");
    expect(source).toContain("on_finish: () => {}");
  });
});

describe("the study's planned sample size", () => {
  const planned = (sampleSize: number): Spec => ({ ...spec(undefined), sample_size: sampleSize });

  it("accepts a whole number of participants", () => {
    expect(() => compileSpec(planned(40), schemas)).not.toThrow();
  });

  it.each([0, -3, 2.5, Number.NaN])("rejects a sample size of %s", (sampleSize) => {
    expect(() => compileSpec(planned(sampleSize), schemas)).toThrow(
      /sample_size is .* not a whole number of participants above 0/,
    );
  });

  it("rejects a sample size written as text", () => {
    const spec = { ...planned(1), sample_size: "40" } as unknown as Spec;
    expect(() => compileSpec(spec, schemas)).toThrow(/sample_size is "40"/);
  });
});
