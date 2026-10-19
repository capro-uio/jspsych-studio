import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { usesDevices } from "../src/setup-order.ts";
import { emitHtml } from "../src/targets/html.ts";
import type { Spec, SpecNode, TrialNode } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const setUp: SpecNode = { kind: "trial", plugin: "webgazer-init-camera" };
const calibrate: SpecNode = { kind: "trial", plugin: "webgazer-calibrate" };
const validate: SpecNode = { kind: "trial", plugin: "webgazer-validate" };
const look = (gaze: TrialNode["gaze"] = {}): TrialNode => ({
  kind: "trial",
  plugin: "html-keyboard-response",
  params: { stimulus: "<p>look</p>" },
  gaze,
});

const study = (timeline: SpecNode[]): Spec => ({ name: "gaze", timeline });
const compiles = (timeline: SpecNode[]) => () => compileSpec(study(timeline), schemas);
const NOT_SET_UP = /needs a "Set up eye tracking" step \(webgazer-init-camera\)/;
const NOT_CALIBRATED =
  /tracks gaze, so it needs a "Calibrate eye tracking" step \(webgazer-calibrate\) that every participant reaches before it/;

describe("eye tracking", () => {
  it("is set up before it is calibrated or checked", () => {
    expect(compiles([calibrate])).toThrow(NOT_SET_UP);
    expect(compiles([validate])).toThrow(NOT_SET_UP);
    expect(compiles([setUp, calibrate, validate])).not.toThrow();
  });

  // The accuracy of an eye tracker that has learnt nothing means nothing.
  it("is calibrated before its accuracy is checked", () => {
    expect(compiles([setUp, validate])).toThrow(
      /plugin "webgazer-validate" needs a "Calibrate eye tracking" step/,
    );
  });

  it("is calibrated before any step tracks gaze", () => {
    expect(compiles([setUp, look()])).toThrow(NOT_CALIBRATED);
    expect(compiles([setUp, look(), calibrate])).toThrow(NOT_CALIBRATED);
    expect(compiles([setUp, calibrate, look()])).not.toThrow();
  });

  it("counts calibration on a path only if every path calibrates", () => {
    const tagged: SpecNode = { ...look(), gaze: undefined, tag: "x" };
    const branch = (otherwise: SpecNode[]): SpecNode => ({
      kind: "branch",
      when: { scope: "x", accuracy_below: 0.5 },
      then: [calibrate],
      otherwise,
    });
    expect(compiles([setUp, tagged, branch([]), look()])).toThrow(NOT_CALIBRATED);
    expect(compiles([setUp, tagged, branch([calibrate]), look()])).not.toThrow();
  });

  it("does not track gaze on the steps that run the eye tracker", () => {
    expect(compiles([setUp, calibrate, { ...validate, gaze: {} }])).toThrow(
      /runs the eye tracker itself, so it cannot also track gaze/,
    );
  });

  it("refuses a blank element to record the place of", () => {
    expect(compiles([setUp, calibrate, look({ targets: [" "] })])).toThrow(
      /names a blank element to record the place of \(gaze\.targets\)/,
    );
  });

  it("starts the eye tracker and tracks only the steps that ask", () => {
    const plain: SpecNode = { ...look(), gaze: undefined };
    const { source, columns } = compileSpec(
      study([
        setUp,
        calibrate,
        look({ targets: ["#jspsych-html-keyboard-response-stimulus"] }),
        plain,
      ]),
      schemas,
    );
    expect(source).toContain("initJsPsych({ extensions: [{ type: LiveWebgazerExtension }] })");
    const tracked = source.match(/extensions: \[\{ type: LiveWebgazerExtension, params/g);
    expect(tracked).toHaveLength(1);
    expect(source).toContain('params: { targets: ["#jspsych-html-keyboard-response-stimulus"] }');
    expect(columns).toEqual(expect.arrayContaining(["webgazer_data", "webgazer_targets"]));
  });

  // The extension reads its targets on every change to the screen without checking for them.
  it("gives a tracked step an empty list of targets rather than none", () => {
    const { source } = compileSpec(study([setUp, calibrate, look()]), schemas);
    expect(source).toContain("params: { targets: [] }");
  });

  it("names an element asked for twice once", () => {
    const { source } = compileSpec(
      study([setUp, calibrate, look({ targets: ["#a", "#a"] })]),
      schemas,
    );
    expect(source).toContain('params: { targets: ["#a"] }');
  });

  it("adds no gaze columns to a study that only calibrates", () => {
    const { columns } = compileSpec(study([setUp, calibrate]), schemas);
    expect(columns).not.toContain("webgazer_data");
  });

  it("leaves a study without eye tracking as it was", () => {
    const { source, scripts } = compileSpec(study([{ ...look(), gaze: undefined }]), schemas);
    expect(source).not.toContain("webgazer");
    expect(scripts).toEqual([]);
  });

  it("loads WebGazer, then the extension, before the plugins", async () => {
    const result = compileSpec(study([setUp, calibrate]), schemas);
    expect(result.scripts.map((script) => script.package)).toEqual([
      "webgazer",
      "@jspsych/extension-webgazer",
    ]);
    const { html } = await emitHtml(result, { title: "gaze" });
    const order = [
      "/jspsych@",
      'data-package="webgazer" src="https://unpkg.com/webgazer@',
      'data-package="@jspsych/extension-webgazer" src="https://unpkg.com/@jspsych/extension-webgazer@',
      "/@jspsych/plugin-webgazer-init-camera@",
    ].map((part) => html.indexOf(part));
    expect(order.every((position) => position > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  // WebGazer would look for its face model beside the page, where it is not.
  it("points WebGazer at the face model beside its own script", () => {
    const { source } = compileSpec(study([setUp]), schemas);
    expect(source.indexOf("webgazer.params.faceMeshSolutionPath")).toBeLessThan(
      source.indexOf("initJsPsych("),
    );
    expect(source).toContain(`document.querySelector("script[data-package=\\"webgazer\\"]").src`);
  });

  // Without WebGazer the settings would stop the page before jsPsych could say what is wrong.
  it("sets WebGazer up only when it has loaded", () => {
    const { source } = compileSpec(study([setUp]), schemas);
    expect(source).toMatch(/if \(window\.webgazer\) \{\s+webgazer\.params/);
  });

  // A paused WebGazer reads the eyes from its last frame, which is the end of calibration, and
  // gives no time with what it estimates.
  it("takes the gaze from a running WebGazer, stamped with the time", () => {
    const { source } = compileSpec(study([setUp]), schemas);
    expect(source).toContain("class LiveWebgazerExtension extends jsPsychExtensionWebgazer");
    expect(source).toContain("this.webgazer.setGazeListener(");
    expect(source).toContain("{ x: gaze.x, y: gaze.y, t: now }");
    expect(source).toMatch(/clearGazeListener\(\);\s+this\.pause\(\);/);
  });

  it("keeps nothing WebGazer learns in the browser for the next participant", () => {
    const { source } = compileSpec(study([setUp]), schemas);
    expect(source).toContain("webgazer.saveDataAcrossSessions(false);");
  });

  it("says so when the schema bundle has no eye tracker", () => {
    const withoutExtensions = { ...schemas, extensions: {} };
    expect(() => compileSpec(study([setUp]), withoutExtensions)).toThrow(
      /the schema bundle has no entry for extension "webgazer"/,
    );
  });

  it("counts as using the camera, for the preview's note", () => {
    expect(usesDevices(study([setUp]))).toBe(true);
  });
});

describe("eye-tracking points", () => {
  const points = (calibration_points: unknown): SpecNode => ({
    kind: "trial",
    plugin: "webgazer-calibrate",
    params: { calibration_points } as TrialNode["params"],
  });

  it("are each a place across and a place down", () => {
    expect(
      compiles([
        setUp,
        points([
          [10, 10],
          [90, 90],
        ]),
      ]),
    ).not.toThrow();
    expect(compiles([setUp, points([[10, 10, 10]])])).toThrow(
      /expects each row of its grid to hold exactly 2 places/,
    );
  });

  it("are whole numbers", () => {
    for (const place of ["10", 12.5, ""]) {
      expect(compiles([setUp, points([[place, 10]])])).toThrow(
        /expects each place of its grid to be a whole number/,
      );
    }
  });
});
