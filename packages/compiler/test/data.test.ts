import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { DATAPIPE_URL } from "../src/data.ts";
import type { Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const specWithData = (data: Spec["data"]): Spec => ({
  name: "saving",
  data,
  timeline: [{ kind: "trial", plugin: "html-keyboard-response", params: { stimulus: "hi" } }],
});

describe("data collection", () => {
  it("adds no saving step when the spec does not ask for one", () => {
    const { source, plugins } = compileSpec(specWithData(undefined), schemas);
    expect(plugins).not.toContain("call-function");
    expect(source).not.toContain("localSave");
  });

  it("downloads a CSV when asked to save locally", () => {
    const { source, plugins } = compileSpec(specWithData({ save: "download" }), schemas);
    expect(plugins).toContain("call-function");
    expect(source).toContain('localSave("csv"');
    expect(source).toContain('"saving" + "_"');
  });

  it("posts to DataPipe by default", () => {
    const { source } = compileSpec(
      specWithData({ save: "post", experiment_id: "abc123DEF456" }),
      schemas,
    );
    expect(source).toContain(`${DATAPIPE_URL}/api/data/`);
    expect(source).toContain('experimentID: "abc123DEF456"');
    expect(source).toContain("async: true");
  });

  it("uses a custom endpoint without doubling the slash", () => {
    const { source } = compileSpec(
      specWithData({
        save: "post",
        experiment_id: "x",
        endpoint: "https://example.org/pipe/",
      }),
      schemas,
    );
    expect(source).toContain("https://example.org/pipe/api/data/");
  });

  it("falls back to a download when the upload fails", () => {
    const { source } = compileSpec(specWithData({ save: "post", experiment_id: "x" }), schemas);
    expect(source).toContain("catch");
    expect(source).toContain("could not be uploaded");
    expect(source).toContain('localSave("csv"');
    expect(source).toContain("abortExperiment");
  });

  it("records a participant id and any URL parameters", () => {
    const { source } = compileSpec(specWithData({ save: "download" }), schemas);
    expect(source).toContain("new URLSearchParams(window.location.search)");
    expect(source).toContain("participant_id");
  });

  it("refuses to upload without an experiment id", () => {
    expect(() => compileSpec(specWithData({ save: "post" }), schemas)).toThrow(
      /needs an experiment id/,
    );
  });
});
