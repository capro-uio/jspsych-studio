import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { usesDevices } from "../src/recordings.ts";
import type { DataSettings, Spec, SpecNode } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const speak: SpecNode = {
  kind: "trial",
  plugin: "html-audio-response",
  params: { stimulus: "<p>say it</p>" },
};
const setUpMicrophone: SpecNode = { kind: "trial", plugin: "initialize-microphone" };

const study = (timeline: SpecNode[], data?: DataSettings): Spec => ({
  name: "rec",
  data,
  timeline,
});
const compiles = (spec: Spec) => () => compileSpec(spec, schemas);

describe("steps that record", () => {
  it("need their device set up by an earlier step", () => {
    expect(compiles(study([speak]))).toThrow(
      /plugin "html-audio-response" needs a "Set up the microphone" step \(initialize-microphone\) before it/,
    );
    expect(compiles(study([speak, setUpMicrophone]))).toThrow(
      /needs a "Set up the microphone" step/,
    );
    expect(compiles(study([setUpMicrophone, speak]))).not.toThrow();
  });

  it("count a set-up step inside an earlier block or path", () => {
    const branch: SpecNode = {
      kind: "branch",
      when: { scope: "x", accuracy_below: 0.5 },
      then: [setUpMicrophone],
    };
    const tagged: SpecNode = {
      kind: "trial",
      plugin: "html-keyboard-response",
      tag: "x",
      params: { stimulus: "<p>a</p>" },
    };
    expect(compiles(study([tagged, branch, speak]))).not.toThrow();
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

  it("download each recording as a file of its own", () => {
    const { source } = compileSpec(study([setUpMicrophone, speak], { save: "download" }), schemas);
    expect(source).toContain(
      'downloadRecordings(jsPsych.data.get(), "rec" + "_" + participantId + ".csv");',
    );
  });

  it("leave a study that saves nothing, or records nothing, without the helpers", () => {
    expect(compileSpec(study([setUpMicrophone, speak]), schemas).source).not.toContain(
      "recordingRows",
    );
    expect(
      compileSpec(study([setUpMicrophone], { save: "download" }), schemas).source,
    ).not.toContain("recordingRows");
  });
});

describe("usesDevices", () => {
  it("finds a step that uses or sets up a camera or microphone", () => {
    expect(usesDevices(study([setUpMicrophone]))).toBe(true);
    expect(usesDevices(study([{ kind: "trial", plugin: "mirror-camera" }]))).toBe(true);
    expect(
      usesDevices(
        study([
          { kind: "trial", plugin: "html-keyboard-response", params: { stimulus: "<p>a</p>" } },
        ]),
      ),
    ).toBe(false);
  });
});
