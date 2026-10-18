import { describe, expect, it } from "vitest";
import { CURATED_PLUGINS } from "../src/curated.ts";
import { PLUGIN_FAMILIES, PLUGIN_LABELS } from "../src/titles.ts";
import { extractSchemas, pluginPackages, toParameterSchema } from "../src/extract.ts";

const packages = pluginPackages();
const report = await extractSchemas(packages);

describe("extractSchemas", () => {
  it("covers every plugin package listed in the manifest", () => {
    expect(report.failures).toEqual([]);
    expect(report.warnings).toEqual([]);
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

  it("falls back to the help text a plugin declares in its own info", () => {
    const canvasWidth = report.schemas["psychophysics"].properties.canvas_width;
    expect(canvasWidth.description).toMatch(/width/i);
  });
});

describe("plugin titles", () => {
  it("gives every plugin a title, a summary and a family", () => {
    for (const schema of Object.values(report.schemas)) {
      expect(schema.title, schema.plugin).not.toBe("");
      expect(schema.summary, schema.plugin).not.toBe("");
      expect(Object.keys(PLUGIN_FAMILIES), schema.plugin).toContain(schema.family);
    }
  });

  it("names only plugins that are extracted, so none is left behind when one is removed", () => {
    expect(Object.keys(PLUGIN_LABELS).sort()).toEqual(Object.keys(report.schemas).sort());
  });

  it("leaves out a plugin with no title, and says why", async () => {
    const { schemas, failures } = await extractSchemas(["@jspsych/plugin-fullscreen"], {});
    expect(schemas).toEqual({});
    expect(failures).toEqual([
      {
        package: "@jspsych/plugin-fullscreen",
        reason: 'plugin "fullscreen" has no title; add one to src/titles.ts',
      },
    ]);
  });

  it("does not take an inherited property for a title", async () => {
    const { failures } = await extractSchemas(["@jspsych/plugin-fullscreen"], {
      __proto__: { fullscreen: PLUGIN_LABELS.fullscreen },
    } as never);
    expect(failures).toHaveLength(1);
  });

  it("gives no two plugins the same title", () => {
    const titles = Object.values(PLUGIN_LABELS).map((label) => label.title);
    expect(new Set(titles).size).toBe(titles.length);
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
