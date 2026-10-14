import { describe, expect, it } from "vitest";
import { extractSchemas, officialPluginPackages } from "../src/extract.ts";

const packages = officialPluginPackages();
const report = await extractSchemas(packages);

describe("extractSchemas", () => {
  it("covers every plugin package listed in the manifest", () => {
    expect(report.failures).toEqual([]);
    expect(Object.keys(report.schemas).length).toBe(packages.length);
  });

  it("records the jsPsych release the schemas were extracted against", () => {
    expect(report.jspsych).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("keeps description coverage at or above 95%", () => {
    expect(report.coverage.ratio).toBeGreaterThanOrEqual(0.95);
  });

  it("derives required parameters from missing defaults", () => {
    expect(report.schemas["image-keyboard-response"].required).toEqual(["stimulus"]);
    expect(report.schemas["html-keyboard-response"].required).toEqual(["stimulus"]);
  });

  it("maps jsPsych parameter types onto JSON Schema types", () => {
    const stimulus = report.schemas["image-keyboard-response"].properties.stimulus;
    expect(stimulus).toMatchObject({ type: "string", format: "asset-image", jspsychType: "IMAGE" });

    const choices = report.schemas["html-keyboard-response"].properties.choices;
    expect(choices).toMatchObject({ type: "array", jspsychType: "KEYS" });
  });

  it("carries JSDoc help text through to the schema", () => {
    const stimulus = report.schemas["image-keyboard-response"].properties.stimulus;
    expect(stimulus.description).toMatch(/path of the image file/i);
  });

  it("expands nested COMPLEX parameters", () => {
    const questions = report.schemas["survey-likert"].properties.questions;
    expect(questions.type).toBe("array");
    expect(questions.items?.properties).toHaveProperty("labels");
  });
});
