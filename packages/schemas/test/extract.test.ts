import { describe, expect, it } from "vitest";
import { CURATED_PLUGINS } from "../src/curated.ts";
import {
  extractSchemas,
  functionSource,
  pluginPackages,
  toParameterSchema,
} from "../src/extract.ts";

const packages = pluginPackages();
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

  it("gives the entries of a list the parameter's own type", () => {
    const pages = report.schemas["instructions"].properties.pages;
    expect(pages.jspsychType).toBe("HTML_STRING");
    expect(pages.items?.jspsychType).toBe("HTML_STRING");
  });

  it("puts a list's options on its entries, since the list holds several", () => {
    const select = 1;
    const schema = toParameterSchema(
      "colours",
      { type: select, array: true, options: ["red", "blue"] },
      new Map([[select, "SELECT"]]),
      {},
    );
    expect(schema.enum).toBeUndefined();
    expect(schema.items?.enum).toEqual(["red", "blue"]);
  });

  it("expands nested COMPLEX parameters", () => {
    const questions = report.schemas["survey-likert"].properties.questions;
    expect(questions.type).toBe("array");
    expect(questions.items?.properties).toHaveProperty("labels");
  });

  it("keeps a default function's source as a code example", () => {
    const buttonHtml = report.schemas["html-button-response"].properties.button_html;
    expect(buttonHtml.default).toBeUndefined();
    expect(buttonHtml.examples).toEqual([
      {
        code: 'function(choice, choice_index) {\n  return `<button class="jspsych-btn">${choice}</button>`;\n}',
      },
    ]);
  });

  it("falls back to the help text a plugin declares in its own info", () => {
    const canvasWidth = report.schemas["psychophysics"].properties.canvas_width;
    expect(canvasWidth.description).toMatch(/width/i);
  });
});

describe("curated third-party plugins", () => {
  const stimuli = report.schemas["psychophysics"].properties.stimuli;
  const item = stimuli.items!;

  it("adds the shape field the plugin reads but does not declare", () => {
    expect(item.required).toEqual(["obj_type"]);
    expect(item.properties?.obj_type.enum).toContain("circle");
  });

  it("names, for every shape offered, the fields that shape reads", () => {
    const shapes = item.properties!.obj_type.enum as string[];
    expect(Object.keys(item.variants!.options).sort()).toEqual([...shapes].sort());
    for (const variant of Object.values(item.variants!.options)) {
      for (const name of [...variant.properties, ...variant.required]) {
        expect(item.properties).toHaveProperty(name);
      }
    }
    for (const name of item.variants!.shared) expect(item.properties).toHaveProperty(name);
  });

  it("describes every field it adds", () => {
    for (const name of ["obj_type", "radius", "fill_color", "file", "content"]) {
      expect(item.properties![name].description).toBeTruthy();
    }
  });

  it("gives a new step a valid starting object", () => {
    expect(stimuli.examples?.[0]).toEqual([{ obj_type: "cross", line_length: 40 }]);
  });

  it("says so when the plugin stops declaring its objects", () => {
    const curate = CURATED_PLUGINS["@kurokida/jspsych-psychophysics"];
    const changed = {
      ...report.schemas["psychophysics"],
      properties: {
        stimuli: { title: "stimuli", type: "string" as const, jspsychType: "STRING" as const },
      },
    };
    expect(() => curate(changed)).toThrow(/curation in curated.ts needs updating/);
  });
});

describe("functionSource", () => {
  it("keeps a one-line function as it is", () => {
    expect(functionSource(() => true)).toBe("() => true");
  });

  it("re-indents a body indented with tabs", () => {
    const fn = { toString: () => "function(a) {\n\t\treturn a;\n\t}" };
    expect(functionSource(fn as unknown as () => unknown)).toBe("function(a) {\n\treturn a;\n}");
  });

  it("re-indents a body written deeper in its file", () => {
    const fn = { toString: () => "function(a) {\n        return a;\n      }" };
    expect(functionSource(fn as unknown as () => unknown)).toBe("function(a) {\n  return a;\n}");
  });
});
