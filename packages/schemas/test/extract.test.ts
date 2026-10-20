import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { CURATED_PLUGINS } from "../src/curated.ts";
import { PLUGIN_FAMILIES, PLUGIN_LABELS } from "../src/titles.ts";
import { BROWSER_BUNDLE, JSPSYCH_STYLESHEET } from "../src/types.ts";
import {
  assertExtracted,
  curateParameters,
  recordedColumns,
  stimulusSelectorOf,
  extractBundle,
  extractExtensions,
  extractSchemas,
  filesFor,
  functionSource,
  integrityOf,
  packageFiles,
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
        widths: {},
      }),
    ).toThrow(/names "key_anwser", which categorize-html does not take/);
  });

  it("reads a list whose default is a list of rows as a grid", () => {
    const { grid, choices } = report.schemas["serial-reaction-time"].properties;
    expect(grid).toMatchObject({
      format: "grid",
      items: { type: "array", items: { type: "integer" } },
    });
    expect(choices).toMatchObject({ format: "grid", items: { items: { type: "string" } } });
  });

  it("holds each eye-tracking point to two places, across then down", () => {
    const calibrate = report.schemas["webgazer-calibrate"].properties.calibration_points;
    const validate = report.schemas["webgazer-validate"].properties.validation_points;
    for (const points of [calibrate, validate]) {
      expect(points).toMatchObject({
        format: "grid",
        items: { minItems: 2, maxItems: 2, items: { type: "integer" } },
      });
    }
  });

  it("refuses a row width for a parameter that is not a grid", () => {
    const schema = structuredClone(report.schemas["webgazer-validate"]);
    expect(() =>
      curateParameters(schema, {
        examples: {},
        lengths: {},
        choices: {},
        distinctKeys: {},
        required: {},
        decimals: {},
        widths: { "webgazer-validate": { roi_radius: 2 } },
      }),
    ).toThrow(/gives a row width to "roi radius", which is not a grid/);
  });

  it("finds the element a plugin shows its stimulus in, however the plugin names it", () => {
    const selectorOf = (plugin: string) => report.schemas[plugin].stimulusSelector;
    // Written into markup with double quotes, with single quotes, and set on an element.
    expect(selectorOf("html-keyboard-response")).toBe("#jspsych-html-keyboard-response-stimulus");
    expect(selectorOf("serial-reaction-time")).toBe("#jspsych-serial-reaction-time-stimulus");
    expect(selectorOf("html-button-response")).toBe("#jspsych-html-button-response-stimulus");
    expect(selectorOf("survey-text")).toBeUndefined();
  });

  it("takes the stimulus element from curation where a plugin names it otherwise", () => {
    expect(report.schemas["serial-reaction-time-mouse"].stimulusSelector).toBe(
      "#jspsych-serial-reaction-time-stimulus",
    );
    expect(report.schemas.animation.stimulusSelector).toBe("#jspsych-animation-image");
  });

  it("says so when a plugin no longer has the stimulus element curation names", () => {
    expect(() =>
      stimulusSelectorOf("@jspsych/plugin-animation", "animation", { animation: "gone" }),
    ).toThrow(/names "gone" as the stimulus of animation, which no longer has it/);
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
    // Calibrating teaches the eye tracker and records nothing of its own.
    const recordsNothing = ["webgazer-calibrate"];
    for (const schema of Object.values(report.schemas)) {
      if (recordsNothing.includes(schema.plugin)) expect(schema.records).toEqual([]);
      else expect(schema.records.length, schema.plugin).toBeGreaterThan(0);
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

describe("extractExtensions", () => {
  it("names the extension, the columns it adds, and the library it needs first", async () => {
    const { webgazer } = await extractExtensions(["@jspsych/extension-webgazer"]);
    expect(webgazer).toMatchObject({
      extension: "webgazer",
      package: "@jspsych/extension-webgazer",
      records: ["webgazer_data", "webgazer_targets"],
      libraries: [{ package: "webgazer", file: "dist/webgazer.js" }],
    });
    expect(webgazer.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(webgazer.libraries[0].version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("refuses a package that exports no extension", async () => {
    await expect(extractExtensions(["jspsych"])).rejects.toThrow(
      /jspsych exports no class with a static `info`/,
    );
  });
});

describe("extractBundle", () => {
  it("bundles the plugins asked for with every installed extension", async () => {
    const { bundle } = await extractBundle(["@jspsych/plugin-html-keyboard-response"]);
    expect(Object.keys(bundle.plugins)).toEqual(["html-keyboard-response"]);
    expect(Object.keys(bundle.extensions)).toEqual(["webgazer"]);
    expect(bundle.families).toEqual(PLUGIN_FAMILIES);
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

describe("integrityOf", () => {
  it("writes the sha384 hash a browser checks a script against", () => {
    expect(integrityOf(new TextEncoder().encode("abc"))).toBe(
      "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn",
    );
  });
});

describe("packageFiles", () => {
  it("hashes each file as it is installed, under the installed version", () => {
    const { version, files } = packageFiles("jspsych", [JSPSYCH_STYLESHEET]);
    const require = createRequire(import.meta.url);
    const css = readFileSync(require.resolve(`jspsych/${JSPSYCH_STYLESHEET}`));
    expect(version).toBe(report.jspsych);
    expect(files).toEqual({ [JSPSYCH_STYLESHEET]: integrityOf(css) });
  });

  it("refuses a file the package does not have", () => {
    expect(() => packageFiles("jspsych", ["dist/not-there.js"])).toThrow(/not-there/);
  });

  it("refuses a package that is not installed", () => {
    expect(() => packageFiles("@jspsych/plugin-not-a-plugin", [BROWSER_BUNDLE])).toThrow();
  });
});

const extensions = await extractExtensions(["@jspsych/extension-webgazer"]);

describe("filesFor", () => {
  const files = filesFor(report.schemas, extensions);

  it("carries jsPsych's browser build and its stylesheet", () => {
    expect(Object.keys(files.jspsych.files)).toEqual([JSPSYCH_STYLESHEET, BROWSER_BUNDLE]);
  });

  it("carries every plugin's browser build, at the version its schema names", () => {
    for (const schema of Object.values(report.schemas)) {
      expect(files[schema.package].version, schema.package).toBe(schema.version);
      expect(Object.keys(files[schema.package].files), schema.package).toContain(BROWSER_BUNDLE);
    }
  });

  it("carries an extension, its library, and the files the library loads as it runs", () => {
    expect(Object.keys(files["@jspsych/extension-webgazer"].files)).toEqual([BROWSER_BUNDLE]);
    const webgazer = Object.keys(files.webgazer.files);
    expect(webgazer).toContain("dist/webgazer.js");
    expect(webgazer).toContain("dist/mediapipe/face_mesh/face_mesh_solution_simd_wasm_bin.wasm");
    expect(webgazer).toContain("dist/mediapipe/face_mesh/face_mesh_solution_packed_assets.data");
  });

  it("hashes every file it lists", () => {
    for (const { files: hashes } of Object.values(files)) {
      for (const hash of Object.values(hashes)) expect(hash).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
    }
  });
});
