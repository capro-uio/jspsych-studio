import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import type { Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const PIXEL = "data:image/png;base64,iVBORw0KGgo=";

const canvas = (stimuli: unknown[], extra: Partial<Spec> = {}): Spec => ({
  name: "canvas",
  timeline: [{ kind: "trial", plugin: "psychophysics", params: { stimuli } }],
  ...extra,
});

const inBlock = (stimuli: unknown[], rows: Record<string, unknown>[]): Spec => ({
  name: "canvas",
  conditions: { rows },
  timeline: [
    {
      kind: "block",
      conditions: "rows",
      children: [{ kind: "trial", plugin: "psychophysics", params: { stimuli } }],
    },
  ],
});

describe("canvas steps", () => {
  it("compiles fixed objects as a plain list", () => {
    const { source, packages } = compileSpec(
      canvas([{ obj_type: "circle", radius: 50, fill_color: "red" }]),
      schemas,
    );
    expect(source).toContain('stimuli: [{"obj_type":"circle","radius":50,"fill_color":"red"}]');
    expect(packages.psychophysics.name).toBe("@kurokida/jspsych-psychophysics");
  });

  it("builds the list when the trial starts once any field reads a column", () => {
    const { source } = compileSpec(
      inBlock(
        [{ obj_type: "circle", radius: 50, fill_color: { var: "colour" }, startX: { var: "x" } }],
        [{ colour: "red", x: -100 }],
      ),
      schemas,
    );
    expect(source).toContain(
      'stimuli: () => [{ "obj_type": "circle", "radius": 50, ' +
        '"fill_color": jsPsych.evaluateTimelineVariable("colour"), ' +
        '"startX": jsPsych.evaluateTimelineVariable("x") }]',
    );
  });

  it("fills a column into a field's surrounding text", () => {
    const { source } = compileSpec(
      inBlock(
        [{ obj_type: "text", content: { var: "word", wrap: "Press for {}" } }],
        [{ word: "red" }],
      ),
      schemas,
    );
    expect(source).toContain(
      '"content": "Press for {}".replace("{}", () => jsPsych.evaluateTimelineVariable("word"))',
    );
  });

  it("resolves a named image through the asset map", () => {
    const { source } = compileSpec(
      canvas([{ obj_type: "image", file: "face.png" }], {
        assets: [{ name: "face.png", url: PIXEL }],
      }),
      schemas,
    );
    expect(source).toContain('stimuli: [{ "obj_type": "image", "file": asset("face.png") }]');
  });

  it("resolves an image named by a column through the asset map", () => {
    const spec = inBlock([{ obj_type: "image", file: { var: "picture" } }], [{ picture: "a.png" }]);
    spec.assets = [{ name: "a.png", url: PIXEL }];
    const { source } = compileSpec(spec, schemas);
    expect(source).toContain('"file": asset(jsPsych.evaluateTimelineVariable("picture"))');
  });
});

describe("checking canvas objects", () => {
  const rejects = (stimuli: unknown[], message: RegExp, extra: Partial<Spec> = {}) =>
    expect(() => compileSpec(canvas(stimuli, extra), schemas)).toThrow(message);

  it("needs every object to say what shape it is", () => {
    rejects([{ radius: 50 }], /entry 1 is missing "obj_type"/);
  });

  it("rejects a shape the plugin does not draw", () => {
    rejects([{ obj_type: "star" }], /field "obj_type" expects one of "cross", "circle"/);
  });

  it("names the field a shape needs", () => {
    rejects([{ obj_type: "circle", fill_color: "red" }], /entry 1 \(circle\) needs "radius"/);
  });

  it("needs a filled shape to have an outline or a fill", () => {
    rejects(
      [{ obj_type: "rect", width: 10, height: 10 }],
      /\(rect\) needs one of "line_color", "fill_color"/,
    );
  });

  it("refuses two ways of sizing one image", () => {
    rejects(
      [{ obj_type: "image", file: "face.png", scale: 2, image_width: 100 }],
      /\(image\) takes only one of "scale", "image_width", "image_height"/,
      { assets: [{ name: "face.png", url: PIXEL }] },
    );
  });

  it("checks the type of a fixed field", () => {
    rejects([{ obj_type: "cross", line_length: "long" }], /field "line_length" expects a number/);
  });

  it("checks that a named image was added", () => {
    rejects([{ obj_type: "image", file: "missing.png" }], /field "file" names "missing.png"/);
  });

  it("checks that a field's column exists", () => {
    expect(() =>
      compileSpec(
        inBlock([{ obj_type: "cross", line_length: { var: "size" } }], [{ length: 40 }]),
        schemas,
      ),
    ).toThrow(/field "line_length" reads column "size", which no enclosing conditions table/);
  });

  it("accepts the starting object a new step is given", () => {
    const example = schemas.plugins.psychophysics.properties.stimuli.examples![0] as unknown[];
    expect(() => compileSpec(canvas(example), schemas)).not.toThrow();
  });
});

describe("other lists of objects", () => {
  it("reads a column into a survey question as well", () => {
    const { source } = compileSpec(
      {
        name: "questionnaire",
        conditions: { rows: [{ statement: "I enjoyed this" }] },
        timeline: [
          {
            kind: "block",
            conditions: "rows",
            children: [
              {
                kind: "trial",
                plugin: "survey-likert",
                params: { questions: [{ prompt: { var: "statement" }, labels: ["no", "yes"] }] },
              },
            ],
          },
        ],
      },
      schemas,
    );
    expect(source).toContain('"prompt": jsPsych.evaluateTimelineVariable("statement")');
  });
});
