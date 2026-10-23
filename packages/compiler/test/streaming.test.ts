import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { DATAPIPE_URL, savesAsItGoes } from "../src/data.ts";
import { packageFileKey } from "../src/package-files.ts";
import { assertFitsInOnePage, emitHtml } from "../src/targets/html.ts";
import { projectFiles } from "../src/targets/project.ts";
import type { DataSettings, Spec, SpecNode } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const keyTrial: SpecNode = {
  kind: "trial",
  plugin: "html-keyboard-response",
  params: { stimulus: "<p>hi</p>" },
};

const streaming = (data: Partial<DataSettings> = {}, extra: Partial<Spec> = {}): Spec => ({
  name: "streaming",
  data: { save: "post", experiment_id: "abc123DEF456", stream: true, ...data },
  timeline: [keyTrial],
  ...extra,
});

const recording = streaming(
  {},
  {
    timeline: [
      { kind: "trial", plugin: "initialize-microphone" },
      { kind: "trial", plugin: "html-audio-response", params: { stimulus: "<p>say</p>" } },
    ],
  },
);

const PIPE_BUNDLE = "@jspsych/extension-pipe/dist/index.browser.min.js";

describe("a study that saves its data as it goes", () => {
  it("is one that uploads and asks for it", () => {
    expect(savesAsItGoes(streaming())).toBe(true);
    expect(savesAsItGoes(streaming({ stream: false }))).toBe(false);
    expect(savesAsItGoes(streaming({ stream: undefined }))).toBe(false);
  });

  it("hands its rows to the DataPipe extension, under the participant's file name", () => {
    const { source } = compileSpec(streaming(), schemas);
    expect(source).toContain("type: jsPsychExtensionPipe");
    expect(source).toContain('experiment_id: "abc123DEF456"');
    expect(source).toContain('filename: () => "streaming" + "_" + participantId + ".csv"');
    expect(source).toContain("on_save: (result) => afterSaving(result.ok)");
    expect(source).not.toContain("base_url");
  });

  it("loads the extension's script, checked against its recorded hash", () => {
    const { files, scripts } = compileSpec(streaming(), schemas);
    expect(scripts.map((script) => script.package)).toEqual(["@jspsych/extension-pipe"]);
    expect(files.map(packageFileKey)).toContain(PIPE_BUNDLE);
  });

  it("points the extension at a self-hosted DataPipe without doubling its slashes", () => {
    const { source } = compileSpec(streaming({ endpoint: "https://pipe.example.org//" }), schemas);
    expect(source).toContain('base_url: "https://pipe.example.org"');
  });

  it("keeps a self-hosted DataPipe's path, so the extension's routes follow it", () => {
    const { source } = compileSpec(
      streaming({ endpoint: "https://example.org/datapipe/" }),
      schemas,
    );
    expect(source).toContain('base_url: "https://example.org/datapipe"');
  });

  it("refuses to stream to an address that is not a web address", () => {
    expect(() => compileSpec(streaming({ endpoint: "javascript:alert(1)" }), schemas)).toThrow(
      /full web address/,
    );
  });

  it("leaves the upload to the extension, keeping the download for when it fails", () => {
    const { source } = compileSpec(streaming(), schemas);
    expect(source).not.toContain("postToDataPipe");
    expect(source).not.toContain(`${DATAPIPE_URL}/api/data/`);
    expect(source).toContain('jsPsych.data.get().localSave("csv", filename)');
    expect(source).toContain("could not be uploaded");
  });

  // jsPsych would write a message given to abortExperiment over the screen saying how saving went.
  it("stops the study without a message of its own", () => {
    const { source } = compileSpec(
      streaming({}, { recruitment: { endings: { complete: { message: "<p>Bye.</p>" } } } }),
      schemas,
    );
    expect(source).toContain("jsPsych.abortExperiment();");
    expect(source).not.toMatch(/abortExperiment\("/);
    expect(source).toContain('jsPsych.getDisplayElement().innerHTML = "\\u003cp>Bye.\\u003c/p>"');
  });

  it("sends the participant back to the platform once the extension has uploaded", () => {
    const { source } = compileSpec(
      streaming(
        {},
        { recruitment: { endings: { complete: { url: "https://platform.example/done" } } } },
      ),
      schemas,
    );
    const handler = source.slice(source.lastIndexOf("afterSaving = (saved) =>"));
    expect(handler).toContain("window.location.assign(completionUrl)");
    expect(handler).toContain("continue here to finish the study");
  });

  it("still uploads each recording as a file of its own", () => {
    const { source } = compileSpec(recording, schemas);
    expect(source).toContain("async function postToDataPipe(");
    expect(source).toContain(
      `await uploadRecordings(jsPsych.data.get(), filename, "${DATAPIPE_URL}/api/base64/"`,
    );
    expect(source).not.toContain(`${DATAPIPE_URL}/api/data/`);
  });

  it("runs the eye tracker beside the extension", () => {
    const { source } = compileSpec(
      streaming(
        {},
        {
          timeline: [
            { kind: "trial", plugin: "webgazer-init-camera" },
            { kind: "trial", plugin: "webgazer-calibrate" },
            keyTrial,
          ],
        },
      ),
      schemas,
    );
    expect(source.match(/extensions: \[/g)).toHaveLength(1);
    expect(source).toMatch(
      /extensions: \[\s*\{ type: LiveWebgazerExtension \},\s*\{\s*type: jsPsychExtensionPipe/,
    );
  });

  // Otherwise a recording that failed in an unforeseen way would leave the participant waiting
  // on the saving screen, with nothing ever uploaded.
  it("stops the study even when uploading a recording throws", () => {
    const { source } = compileSpec(recording, schemas);
    expect(source).toMatch(
      /try \{\s*await uploadRecordings\([^;]*\);\s*\} finally \{\s*jsPsych\.abortExperiment\(\);\s*\}/,
    );
    expect(source.indexOf("afterSaving = (saved)")).toBeLessThan(
      source.indexOf("await uploadRecordings("),
    );
  });

  it("carries a Firebase credit beside the extension in a project folder", async () => {
    const spec = streaming();
    const copies = Object.fromEntries(
      compileSpec(spec, schemas).files.map((file) => [packageFileKey(file), "copy"]),
    );
    const files = await projectFiles(spec, schemas, {
      packageSources: () => Promise.resolve(copies),
    });
    expect(files["lib/THIRD-PARTY.md"]).toMatch(
      /\| firebase \(inside @jspsych\/extension-pipe\) \| [\d.]+ \| Apache-2\.0 \| https:\/\/github\.com\/firebase\/firebase-js-sdk \|/,
    );
  });

  it("can be carried in one page, its extension loaded from a checked data: URL", async () => {
    const compiled = compileSpec(streaming(), schemas);
    expect(() => assertFitsInOnePage(compiled)).not.toThrow();
    const copies = Object.fromEntries(
      compiled.files.map((file) => [
        packageFileKey(file),
        new TextEncoder().encode(`/* ${packageFileKey(file)} */`),
      ]),
    );
    const { html } = await emitHtml(compiled, { title: "streaming", inline: copies });
    const pipe = compiled.files.find((file) => packageFileKey(file) === PIPE_BUNDLE)!;
    const encoded = btoa(`/* ${PIPE_BUNDLE} */`);
    expect(html).toContain(
      `<script data-package="@jspsych/extension-pipe" src="data:text/javascript;base64,${encoded}" ` +
        `integrity="${pipe.integrity}"></script>`,
    );
    expect(html).not.toContain(`/* ${PIPE_BUNDLE} */`);
  });

  it("tells whoever hosts it that unfinished sessions leave a partial file", async () => {
    const files = await projectFiles(streaming(), schemas);
    expect(files["README.md"]).toContain("partial file");
    const atTheEnd = await projectFiles(streaming({ stream: false }), schemas);
    expect(atTheEnd["README.md"]).not.toContain("partial file");
  });
});

describe("a study that saves its data only at the end", () => {
  it("loads no extension and uploads the data itself", () => {
    const { source, scripts } = compileSpec(streaming({ stream: false }), schemas);
    expect(source).not.toContain("jsPsychExtensionPipe");
    expect(scripts).toEqual([]);
    expect(source).toContain(`await postToDataPipe("${DATAPIPE_URL}/api/data/", {`);
  });
});

describe("checking a study that saves its data as it goes", () => {
  it("needs the data uploaded", () => {
    expect(() => compileSpec(streaming({ save: "download" }), schemas)).toThrow(
      /saving data as it goes needs data uploaded to DataPipe/,
    );
  });

  it("refuses anything but true or false", () => {
    expect(() => compileSpec(streaming({ stream: "yes" as unknown as boolean }), schemas)).toThrow(
      /saving data as it goes is true or false, not "yes"/,
    );
  });

  // Rows already sent cannot be called back.
  it.each(["checkpoint", "nothing"] as const)("refuses an ending that keeps %s", (keep) => {
    const spec = streaming(
      {},
      { recruitment: { endings: { declined: { message: "<p>Bye.</p>", keep } } } },
    );
    expect(() => compileSpec(spec, schemas)).toThrow(
      /the "declined" ending keeps less than all the data, but data saved as it goes has already been sent/,
    );
    expect(() =>
      compileSpec({ ...spec, data: { ...spec.data!, stream: false } }, schemas),
    ).not.toThrow();
  });
});
