import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { compileEndStep } from "../src/endings.ts";
import { dataColumns } from "../src/metadata.ts";
import type { Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const PROLIFIC = "https://app.prolific.com/submissions/complete?cc=NOCONSENT";

const consent = {
  kind: "trial" as const,
  plugin: "html-keyboard-response",
  tag: "consent",
  params: { stimulus: "<p>y or n?</p>" },
};

const study = (overrides: Partial<Spec> = {}): Spec => ({
  name: "consenting",
  data: { save: "post", experiment_id: "x" },
  recruitment: { endings: { no_consent: { message: "<p>Thank you anyway.</p>" } } },
  timeline: [
    consent,
    {
      kind: "branch",
      when: { scope: "consent", response_equals: "n" },
      then: [{ kind: "end", ending: "no_consent" }],
    },
    { kind: "trial", plugin: "html-keyboard-response", params: { stimulus: "<p>task</p>" } },
  ],
  ...overrides,
});

describe("ending the study early", () => {
  it("writes a row naming the ending, then saves and shows its message", () => {
    const { source } = compileSpec(study(), schemas);
    const end = source.slice(source.indexOf('ending: "no_consent"'));
    expect(end.indexOf('ending: "no_consent"')).toBeLessThan(end.indexOf("fetch("));
    expect(end).toContain('jsPsych.abortExperiment("\\u003cp>Thank you anyway.\\u003c/p>");');
  });

  it("still tells a participant whose upload failed about the file, then the message", () => {
    const { source } = compileSpec(study(), schemas);
    expect(source).toContain(
      "send the file to the researcher.\\u003c/p>\\u003cp>Thank you anyway.",
    );
  });

  it("sends the participant to the ending's address once the data is uploaded", () => {
    const { source } = compileSpec(
      study({ recruitment: { endings: { no_consent: { url: PROLIFIC } } } }),
      schemas,
    );
    expect(source).toContain(`const completionUrl = ${JSON.stringify(PROLIFIC)};`);
    expect(source).toContain("window.location.assign(completionUrl);");
  });

  it("downloads, then shows the message, when data is saved locally", () => {
    const { source } = compileSpec(study({ data: { save: "download" } }), schemas);
    expect(source).toMatch(/localSave\("csv",[^)]*\);\s*jsPsych\.abortExperiment\(/);
  });

  it("only shows the message when the study keeps no data", () => {
    const { source, plugins } = compileSpec(study({ data: undefined }), schemas);
    expect(source).not.toContain("localSave");
    expect(source).not.toContain("fetch(");
    expect(source).toContain("abortExperiment");
    expect(plugins).toContain("call-function");
  });

  it("ends a completed study with the complete ending's message", () => {
    const { source } = compileSpec(
      study({
        data: undefined,
        recruitment: { endings: { complete: { message: "<p>Done!</p>" } } },
        timeline: [consent],
      }),
      schemas,
    );
    expect(source).toContain('jsPsych.abortExperiment("\\u003cp>Done!\\u003c/p>");');
  });

  it("stops the study even when the ending holds nothing to do", () => {
    const node = { kind: "end" as const, ending: "missing" };
    for (const data of [undefined, { save: "post" as const, experiment_id: "x" }]) {
      const { source } = compileEndStep(node, { name: "unchecked", data, timeline: [node] });
      expect(source).toContain("The study has ended.");
      expect(source).not.toContain("done();");
    }
  });

  it("keeps a link from setting the columns the study writes itself", () => {
    const { source } = compileSpec(study(), schemas);
    expect(source).toContain('.filter(([name]) => !["ending","checkpoint"].includes(name))');
  });

  it("lists the ending column in the dataset description", () => {
    expect(dataColumns(study())).toContain("ending");
    expect(dataColumns({ ...study(), timeline: [consent] })).not.toContain("ending");
  });

  it("rejects an end step whose ending the study does not have", () => {
    const misspelled = study();
    misspelled.timeline[1] = {
      kind: "branch",
      when: { scope: "consent", response_equals: "n" },
      then: [{ kind: "end", ending: "no_consnet" }],
    };
    expect(() => compileSpec(misspelled, schemas)).toThrow(
      'reaches the ending "no_consnet", which the study does not have (endings: no_consent)',
    );
  });

  it("rejects an end step that names nothing", () => {
    const unnamed = study({
      recruitment: undefined,
      timeline: [consent, { kind: "end", ending: "" }],
    });
    expect(() => compileSpec(unnamed, schemas)).toThrow(
      /an end step needs to name the ending it reaches$/m,
    );
  });
});
