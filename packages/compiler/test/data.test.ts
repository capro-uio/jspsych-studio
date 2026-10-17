import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { DATAPIPE_URL } from "../src/data.ts";
import { reservedLinkColumns } from "../src/metadata.ts";
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

const recruited = (
  recruitment: Spec["recruitment"],
  data: Spec["data"] | null = { save: "post", experiment_id: "x" },
): Spec => ({ ...specWithData(data ?? undefined), recruitment });
const PROLIFIC = "https://app.prolific.com/submissions/complete?cc=C1A2B3";

describe("recruiting from a platform", () => {
  it("takes the participant id from the platform's parameter", () => {
    const { source } = compileSpec(recruited({ id_param: "PROLIFIC_PID" }), schemas);
    expect(source).toContain('const participantId = linkParameters.get("PROLIFIC_PID")');
  });

  it("takes the id from the parameter the platform is known to use", () => {
    const { source } = compileSpec(recruited({ platform: "sona" }), schemas);
    expect(source).toContain('const participantId = linkParameters.get("id")');
  });

  it("takes the id from participant_id when no parameter is named", () => {
    const { source } = compileSpec(recruited({}), schemas);
    expect(source).toContain('const participantId = linkParameters.get("participant_id")');
  });

  // A link reused from before the platform was set up may still carry participant_id=test.
  it("lets the platform's id win over a participant_id also in the link", () => {
    const { source } = compileSpec(recruited({ id_param: "PROLIFIC_PID" }), schemas);
    expect(source.indexOf("...urlParameters")).toBeLessThan(
      source.indexOf("participant_id: participantId"),
    );
  });

  it("keeps the platform's id parameter under its own name", () => {
    expect(reservedLinkColumns(recruited({ id_param: "PROLIFIC_PID" }))).not.toContain(
      "PROLIFIC_PID",
    );
  });

  it("names the file after the id bound before any trial runs", () => {
    const { source } = compileSpec(recruited({ id_param: "PROLIFIC_PID" }), schemas);
    expect(source).toContain('const filename = "saving" + "_" + participantId + ".csv";');
  });

  it("tells the participant why they are leaving, then sends them back", () => {
    const { source } = compileSpec(
      recruited({ endings: { complete: { url: PROLIFIC } } }),
      schemas,
    );
    expect(source).toContain(`const completionUrl = ${JSON.stringify(PROLIFIC)};`);
    // Ending the trial would clear the message before the platform loads.
    expect(source).toMatch(
      /Taking you back to finish the study\.\\u003c\/p>";\s*\}\s*catch[\s\S]*?\}\s*window\.location\.assign\(completionUrl\);\s*\}/,
    );
    expect(source).not.toContain("done();");
  });

  it("puts the participant id into the return address where it is asked for", () => {
    const { source } = compileSpec(
      recruited({
        endings: { complete: { url: "https://u.sona-systems.com/c?survey_code={participant_id}" } },
      }),
      schemas,
    );
    expect(source).toContain(
      'const completionUrl = "https://u.sona-systems.com/c?survey_code=" + encodeURIComponent(participantId);',
    );
  });

  it("links back to the platform when the upload fails", () => {
    const { source } = compileSpec(
      recruited({ endings: { complete: { url: PROLIFIC } } }),
      schemas,
    );
    expect(source).toContain("continue here to finish the study");
    expect(source).toContain('completionUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;")');
  });

  it("does not redirect without a completion address", () => {
    const { source } = compileSpec(recruited({ id_param: "PROLIFIC_PID" }), schemas);
    expect(source).not.toContain("completionUrl");
    expect(source).toContain("done();");
  });
});

describe("checking a recruitment setup", () => {
  const compileWith = (recruitment: unknown, data?: Spec["data"] | null) => () =>
    compileSpec(recruited(recruitment as Spec["recruitment"], data), schemas);

  it.each([
    ["javascript:alert(1)", "needs a web address starting https://"],
    ["HTTPS://app.prolific.com/x", "needs a web address starting https://"],
    ["http://app.prolific.com/x", "needs a web address starting https://"],
    ["https://{participant_id}/done", "can only use {participant_id} after the domain"],
    ["https://x.com@{participant_id}/done", "can only use {participant_id} after the domain"],
    ["https://", "is not a web address a browser can open"],
  ])("refuses %s as a return address", (url, problem) => {
    expect(compileWith({ endings: { complete: { url } } })).toThrow(`"complete" ending ${problem}`);
  });

  it("accepts the id anywhere after the domain", () => {
    expect(
      compileWith({ endings: { complete: { url: `${PROLIFIC}&pid={participant_id}` } } }),
    ).not.toThrow();
  });

  it("reports a malformed ending instead of failing on it", () => {
    expect(compileWith({ endings: { complete: null } })).toThrow("needs a web address");
    expect(compileWith({ endings: "https://x.com" })).toThrow("must be a set of named endings");
  });

  it("accepts an ending shown as a message, with or without uploading", () => {
    for (const data of [null, { save: "download" } as const]) {
      expect(
        compileWith({ endings: { complete: { message: "<p>Thanks!</p>" } } }, data),
      ).not.toThrow();
    }
  });

  it.each([
    [{ url: PROLIFIC, message: "<p>bye</p>" }, "sends the participant away or shows a message"],
    [{ message: " " }, "needs a message to show"],
    [{}, "needs a web address starting https:// or a message"],
  ])("refuses the ending %j", (ending, problem) => {
    expect(compileWith({ endings: { no_consent: ending } })).toThrow(
      `the "no_consent" ending ${problem}`,
    );
  });

  it.each([" ", "no consent", "__proto__", "1st"])("refuses an ending called %j", (name) => {
    expect(compileWith({ endings: { [name]: { message: "<p>bye</p>" } } })).toThrow(
      "needs a name that starts with a letter",
    );
  });

  it("refuses to redirect from an early ending when the data is not uploaded", () => {
    expect(compileWith({ endings: { no_consent: { url: PROLIFIC } } }, null)).toThrow(
      "needs data uploaded first",
    );
  });

  it("refuses a platform it does not know", () => {
    expect(compileWith({ platform: "mturk" })).toThrow('unknown platform "mturk"');
    expect(compileWith({ platform: "constructor" })).toThrow('unknown platform "constructor"');
  });

  it("refuses to redirect when the data is not uploaded", () => {
    for (const data of [null, { save: "download" } as const]) {
      expect(compileWith({ endings: { complete: { url: PROLIFIC } } }, data)).toThrow(
        "needs data uploaded first",
      );
    }
  });
});

describe("link parameters named like the study's own columns", () => {
  const scored: Spec = {
    name: "scored",
    data: { save: "download" },
    timeline: [
      {
        kind: "assign",
        method: "random",
        record_as: "arm",
        groups: [
          {
            name: "a",
            children: [
              {
                kind: "trial",
                plugin: "html-keyboard-response",
                tag: "practice",
                params: { stimulus: "hi" },
                record: { congruency: "same" },
                score: { correct_if_response_equals: "f" },
              },
            ],
          },
          {
            name: "b",
            children: [
              { kind: "trial", plugin: "html-keyboard-response", params: { stimulus: "hi" } },
            ],
          },
        ],
      },
      { kind: "checkpoint", name: "done" },
    ],
  };

  it("moves every column the spec writes out of the way", () => {
    expect(reservedLinkColumns(scored)).toEqual(
      expect.arrayContaining([
        ...["correct", "tag", "response", "rt", "congruency", "arm", "checkpoint"],
        ...["experiment", "trial_index"],
      ]),
    );
    expect(compileSpec(scored, schemas).source).toContain('"congruency"');
  });

  it("reads the data fields of every plugin the study runs when it starts", () => {
    const { source } = compileSpec(scored, schemas);
    expect(source).toMatch(
      /\.\.\.\[[^\]]*jsPsychHtmlKeyboardResponse[^\]]*\]\.flatMap\(\(plugin\) => Object\.keys\(plugin\.info\.data \?\? \{\}\)\)/,
    );
    expect(source).toContain('reservedColumns.has(name) ? unreserved("url_" + name) : name');
  });
});
