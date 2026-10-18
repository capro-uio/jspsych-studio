import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { compileEndStep } from "../src/endings.ts";
import { dataColumns } from "../src/metadata.ts";
import type { Ending, Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const PROLIFIC = "https://app.prolific.com/submissions/complete?cc=NOCONSENT";
const THANKS: Ending = { message: "<p>Thank you anyway.</p>" };

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

  it("lists the ending column in the dataset description", () => {
    expect(dataColumns(study(), [])).toContain("ending");
    expect(dataColumns({ ...study(), timeline: [consent] }, [])).not.toContain("ending");
  });

  // Such a study saves nothing, but the participant's id still goes into the address it returns to.
  it("lists the participant columns for a study that only sends participants back", () => {
    const sendsBack = study({
      data: undefined,
      recruitment: { endings: { no_consent: { url: PROLIFIC, keep: "nothing" } } },
    });
    expect(dataColumns(sendsBack, [])).toEqual(
      expect.arrayContaining(["experiment", "participant_id"]),
    );
    expect(dataColumns({ ...sendsBack, recruitment: undefined }, [])).not.toContain(
      "participant_id",
    );
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

describe("what an early ending keeps", () => {
  const keeping = (
    ending: Ending,
    data: Spec["data"] | null = { save: "post", experiment_id: "x" },
  ) =>
    compileSpec(
      study({ data: data ?? undefined, recruitment: { endings: { no_consent: ending } } }),
      schemas,
    ).source;
  // From the end step's marker up to the task after the branch, leaving out the final save.
  const endStep = (source: string) =>
    source.slice(source.indexOf('ending: "no_consent"'), source.indexOf("\\u003cp>task"));

  it("keeps every row unless it says otherwise", () => {
    const step = endStep(keeping(THANKS));
    expect(step).toContain("data: jsPsych.data.get().csv()");
  });

  it("uploads, or downloads after a failed upload, only the row naming the ending", () => {
    const step = endStep(keeping({ ...THANKS, keep: "checkpoint" }));
    const kept = 'jsPsych.data.get().filter({ ending: "no_consent" })';
    expect(step).toContain(`data: ${kept}.csv()`);
    expect(step).toContain(`${kept}.localSave("csv", filename)`);
  });

  it("downloads only that row when the study saves locally", () => {
    const step = endStep(keeping({ ...THANKS, keep: "checkpoint" }, { save: "download" }));
    expect(step).toContain('jsPsych.data.get().filter({ ending: "no_consent" }).localSave("csv"');
  });

  it.each([
    ["uploading", { save: "post" as const, experiment_id: "x" }],
    ["downloading", { save: "download" as const }],
  ])("saves and sends nothing when it keeps nothing, even a study %s", (_, data) => {
    const step = endStep(keeping({ ...THANKS, keep: "nothing" }, data));
    expect(step).not.toContain("fetch(");
    expect(step).not.toContain("localSave");
    expect(step).not.toContain(".csv()");
    expect(step).toContain('jsPsych.abortExperiment("\\u003cp>Thank you anyway.\\u003c/p>");');
  });

  it("sends the participant back without saving when it keeps nothing", () => {
    const step = endStep(keeping({ url: `${PROLIFIC}&pid={participant_id}`, keep: "nothing" }));
    expect(step).not.toContain("fetch(");
    expect(step).toContain("async: true");
    expect(step).toContain(
      `window.location.assign(${JSON.stringify(`${PROLIFIC}&pid=`)} + encodeURIComponent(participantId));`,
    );
  });

  it.each([
    ["downloads its data", { save: "download" as const }],
    ["keeps no data", null],
  ])("sends a participant back with nothing kept from a study that %s", (_, data) => {
    const url = `${PROLIFIC}&pid={participant_id}`;
    const source = keeping({ url, keep: "nothing" }, data);
    expect(source).toContain("const participantId = linkParameters.get(");
    expect(endStep(source)).toContain("window.location.assign(");
  });

  it("still needs uploading before a redirect that keeps something", () => {
    expect(() => keeping({ url: PROLIFIC, keep: "checkpoint" }, { save: "download" })).toThrow(
      "needs data uploaded first",
    );
  });

  it("keeps the spec's own columns off the one that picks out the kept row", () => {
    const recording = study();
    recording.timeline[0] = { ...consent, record: { ending: "no_consent" } };
    expect(() => compileSpec(recording, schemas)).toThrow(
      'records "ending", which is a column the study writes itself',
    );
    const grouping = study();
    grouping.timeline.unshift({
      kind: "assign",
      method: "random",
      record_as: "checkpoint",
      groups: [
        { name: "a", children: [consent] },
        { name: "b", children: [consent] },
      ],
    });
    expect(() => compileSpec(grouping, schemas)).toThrow(
      'cannot record its group as "checkpoint", which is a column the study writes itself',
    );
  });

  it("leaves a completed study keeping everything", () => {
    const completing = study({
      recruitment: { endings: { complete: { url: PROLIFIC, keep: "nothing" } } },
      timeline: [consent],
    });
    expect(() => compileSpec(completing, schemas)).toThrow(
      'the "complete" ending keeps all the data; only an early ending can keep less',
    );
  });

  it("rejects keeping something it does not know", () => {
    expect(() => keeping({ ...THANKS, keep: "some" as never })).toThrow(
      'keeps "all", "checkpoint", "nothing", not "some"',
    );
  });
});
