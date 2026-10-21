import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { checksDevices, usesDevices } from "../src/setup-order.ts";
import type { DataSettings, Spec, SpecNode, TrialNode } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const speak: SpecNode = {
  kind: "trial",
  plugin: "html-audio-response",
  params: { stimulus: "<p>say it</p>" },
};
const setUpMicrophone: SpecNode = { kind: "trial", plugin: "initialize-microphone" };
const tagged: SpecNode = {
  kind: "trial",
  plugin: "html-keyboard-response",
  tag: "x",
  params: { stimulus: "<p>a</p>" },
};

const study = (timeline: SpecNode[], data?: DataSettings): Spec => ({
  name: "rec",
  data,
  timeline,
});
const compiles = (spec: Spec) => () => compileSpec(spec, schemas);
const NOT_SET_UP =
  /needs a "Set up the microphone" step \(initialize-microphone\) that every participant reaches before it/;

describe("steps that record", () => {
  it("need their device set up by an earlier step", () => {
    expect(compiles(study([speak]))).toThrow(NOT_SET_UP);
    expect(compiles(study([speak, setUpMicrophone]))).toThrow(NOT_SET_UP);
    expect(compiles(study([setUpMicrophone, speak]))).not.toThrow();
  });

  it("count a set-up step inside an earlier block", () => {
    const block: SpecNode = { kind: "block", conditions: "rows", children: [setUpMicrophone] };
    expect(compiles({ ...study([block, speak]), conditions: { rows: [{ a: 1 }] } })).not.toThrow();
  });

  it("count a set-up step on a path only if every path has one", () => {
    const branch = (otherwise: SpecNode[]): SpecNode => ({
      kind: "branch",
      when: { scope: "x", accuracy_below: 0.5 },
      then: [setUpMicrophone],
      otherwise,
    });
    expect(compiles(study([tagged, branch([]), speak]))).toThrow(NOT_SET_UP);
    expect(compiles(study([tagged, branch([setUpMicrophone]), speak]))).not.toThrow();
  });

  it("do not count a set-up step in another group", () => {
    const split: SpecNode = {
      kind: "assign",
      method: "random",
      groups: [
        { name: "a", children: [setUpMicrophone] },
        { name: "b", children: [speak] },
      ],
    };
    expect(compiles(study([split]))).toThrow(NOT_SET_UP);
  });

  it("do not count a set-up step in a counterbalanced task that may come later", () => {
    const tasks: SpecNode = {
      kind: "counterbalance",
      method: "random",
      tasks: [
        { name: "a", children: [setUpMicrophone] },
        { name: "b", children: [speak] },
      ],
    };
    expect(compiles(study([tasks]))).toThrow(NOT_SET_UP);
  });

  it("count a set-up step in any counterbalanced task for the steps after them all", () => {
    const tasks: SpecNode = {
      kind: "counterbalance",
      method: "random",
      tasks: [
        { name: "a", children: [setUpMicrophone] },
        { name: "b", children: [tagged] },
      ],
    };
    expect(compiles(study([tasks, speak]))).not.toThrow();
  });

  it("need the camera set up to show it", () => {
    expect(compiles(study([{ kind: "trial", plugin: "mirror-camera" }]))).toThrow(
      /needs a "Set up the camera" step \(initialize-camera\)/,
    );
  });

  it("upload each recording to DataPipe's own address before the data", () => {
    const { source } = compileSpec(
      study([setUpMicrophone, speak], { save: "post", experiment_id: "abc" }),
      schemas,
    );
    expect(source).toContain("async function uploadRecordings(");
    expect(source).toContain(
      'await uploadRecordings(jsPsych.data.get(), filename, "https://pipe.jspsych.org/api/base64/", "abc");',
    );
  });

  it("keep recordings inside a downloaded file, or a study that saves nothing", () => {
    expect(
      compileSpec(study([setUpMicrophone, speak], { save: "download" }), schemas).source,
    ).not.toContain("recordingRows");
    expect(compileSpec(study([setUpMicrophone, speak]), schemas).source).not.toContain(
      "recordingRows",
    );
  });
});

describe("usesDevices", () => {
  it("finds a step that uses or sets up a camera or microphone", () => {
    expect(usesDevices(study([setUpMicrophone]))).toBe(true);
    expect(usesDevices(study([{ kind: "trial", plugin: "mirror-camera" }]))).toBe(true);
    expect(usesDevices(study([tagged]))).toBe(false);
  });
});

describe("checksDevices", () => {
  const check = (params?: Record<string, unknown>): TrialNode => ({
    kind: "trial",
    plugin: "browser-check",
    params: params as TrialNode["params"],
  });

  it("finds a browser check that records every feature, as by default", () => {
    expect(checksDevices(study([check()]))).toBe(true);
  });

  it.each(["webcam", "microphone"])("finds a browser check that looks for the %s", (device) => {
    expect(checksDevices(study([check({ features: ["width", device] })]))).toBe(true);
  });

  it("counts a list of features read from a column as possibly holding either", () => {
    expect(checksDevices(study([check({ features: { var: "features" } })]))).toBe(true);
  });

  it("passes over a browser check that looks for neither, and other steps", () => {
    expect(checksDevices(study([check({ features: ["width", "height"] }), tagged]))).toBe(false);
  });
});
