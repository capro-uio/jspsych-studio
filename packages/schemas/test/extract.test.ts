import { describe, expect, it } from "vitest";
import { CURATED_PLUGINS } from "../src/curated.ts";
import { PLUGIN_FAMILIES, PLUGIN_LABELS } from "../src/titles.ts";
import {
  assertExtracted,
  curateParameters,
  recordedColumns,
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

  it("keeps a default function's source as a code example", () => {
    const buttonHtml = report.schemas["html-button-response"].properties.button_html;
    expect(buttonHtml.default).toBeUndefined();
    expect(buttonHtml.examples).toEqual([
      {
        code: 'function(choice, choice_index) {\n  return `<button class="jspsych-btn">${choice}</button>`;\n}',
      },
    ]);
  });

  it("gives every number parameter a number, or null for none, as its default", () => {
    for (const schema of Object.values(report.schemas)) {
      for (const [name, parameter] of Object.entries(schema.properties)) {
        if (parameter.jspsychType !== "INT" && parameter.jspsychType !== "FLOAT") continue;
        if (!("default" in parameter) || parameter.type === "array") continue;
        expect(
          parameter.default === null || typeof parameter.default === "number",
          `${schema.plugin}.${name}`,
        ).toBe(true);
      }
    }
    expect(report.schemas["video-keyboard-response"].properties.width.default).toBeNull();
  });

  it("gives a plugin its starting examples where no form could guess the value", () => {
    expect(report.schemas["categorize-html"].properties.key_answer.examples).toEqual(["f"]);
    expect(report.schemas["same-different-html"].properties.stimuli.examples).toEqual([
      ["<p>A</p>", "<p>A</p>"],
    ]);
  });

  it("holds a same/different pair to two stimuli, and lists the columns it does not declare", () => {
    const pair = report.schemas["same-different-image"];
    expect(pair.properties.stimuli).toMatchObject({ minItems: 2, maxItems: 2 });
    expect(pair.records).toEqual(expect.arrayContaining(["rt_stim1", "response_stim1"]));
  });

  it("refuses curation naming a parameter the plugin does not take", () => {
    const schema = structuredClone(report.schemas["categorize-html"]);
    expect(() =>
      curateParameters(schema, {
        examples: { "categorize-html": { key_anwser: "f" } },
        lengths: {},
        choices: {},
        distinctKeys: {},
        required: {},
        decimals: {},
      }),
    ).toThrow(/names "key_anwser", which categorize-html does not take/);
  });

  it("takes decimal card sizes for calibrating the screen", () => {
    expect(report.schemas.resize.properties.item_width).toMatchObject({
      type: "number",
      jspsychType: "FLOAT",
    });
  });

  it("lists the columns each plugin writes into its data", () => {
    expect(report.schemas["html-slider-response"].records).toEqual(
      expect.arrayContaining(["response", "rt", "stimulus", "slider_start"]),
    );
    for (const schema of Object.values(report.schemas)) {
      expect(schema.records.length, schema.plugin).toBeGreaterThan(0);
    }
  });

  it("lists no columns for a plugin that declares no data", () => {
    expect(recordedColumns({})).toEqual([]);
    expect(recordedColumns({ data: { rt: {}, response: {} } })).toEqual(["rt", "response"]);
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

  it("refuses a report that left a plugin out", async () => {
    const report = await extractSchemas(["@jspsych/plugin-fullscreen"], {});
    expect(() => assertExtracted(report)).toThrow(
      /1 plugin\(s\) could not be extracted:\n {2}! @jspsych\/plugin-fullscreen: plugin "fullscreen" has no title/,
    );
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
