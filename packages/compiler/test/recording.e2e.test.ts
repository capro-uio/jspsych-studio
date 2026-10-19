import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { emitHtml } from "../src/targets/html.ts";
import type { Spec } from "../src/types.ts";
import { recordsOf } from "./csv.ts";
import { serveDirectory, type StaticServer } from "./server.ts";
import { schemas } from "./schemas.ts";

const PAGE_NAME = "recording.e2e.html";
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

let browser: Browser;
let server: StaticServer;

beforeAll(async () => {
  server = await serveDirectory(workspaceRoot);
  // Chrome's stand-in camera and microphone, granted without asking.
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
}, 120_000);

afterEach(() => {
  server.uploads.length = 0;
  server.recordings.length = 0;
  server.failRecordings = false;
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
  rmSync(join(workspaceRoot, PAGE_NAME), { force: true });
});

const recordingStudy = (
  data: Spec["data"] = { save: "post", experiment_id: "testExperiment", endpoint: server.url },
): Spec => ({
  name: "recording",
  data,
  timeline: [
    { kind: "trial", plugin: "initialize-microphone" },
    { kind: "trial", plugin: "initialize-camera" },
    {
      kind: "trial",
      plugin: "html-audio-response",
      tag: "spoken",
      params: { stimulus: "<p>say something</p>", recording_duration: 600 },
    },
    {
      kind: "trial",
      plugin: "html-video-response",
      tag: "filmed",
      params: { stimulus: "<p>wave</p>", recording_duration: 600 },
    },
  ],
});

async function record(spec: Spec) {
  const { html } = await emitHtml(compileSpec(spec, schemas), {
    title: "recording",
    base: "/node_modules",
  });
  writeFileSync(join(workspaceRoot, PAGE_NAME), html);
  const page = await browser.newPage({ acceptDownloads: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  await page.goto(`${server.url}/${PAGE_NAME}?participant_id=p1`);
  // A participant chooses from the list once it is there, as these wait to.
  await page.locator("#which-mic option").first().waitFor({ state: "attached", timeout: 15_000 });
  await page.locator("#btn-select-mic").click();
  await page
    .locator("#which-camera option")
    .first()
    .waitFor({ state: "attached", timeout: 15_000 });
  await page.locator("#btn-select-camera").click();
  return { page, errors };
}

describe("a study that records", () => {
  it("saves each recording as a file of its own, which its row names", async () => {
    const { page, errors } = await record(recordingStudy());

    await expect.poll(() => server.uploads.length, { timeout: 30_000 }).toBe(1);

    expect(server.recordings.map((file) => file.filename).sort()).toEqual([
      expect.stringMatching(/^recording_p1_trial2\.webm$/),
      expect.stringMatching(/^recording_p1_trial3\.webm$/),
    ]);
    for (const file of server.recordings) {
      expect(file.experimentID).toBe("testExperiment");
      expect(Buffer.from(file.data, "base64").subarray(0, 4)).toEqual(
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      );
    }
    const rows = recordsOf(server.uploads[0].data);
    expect(rows.find((row) => row.tag === "spoken")?.response).toBe("recording_p1_trial2.webm");
    expect(rows.find((row) => row.tag === "filmed")?.response).toBe("recording_p1_trial3.webm");
    expect(server.uploads[0].data.length).toBeLessThan(10_000);
    expect(errors).toEqual([]);
    await page.close();
  });

  it("keeps a recording it cannot upload inside the data, and uploads the rest", async () => {
    server.failRecordings = true;
    const { page, errors } = await record(recordingStudy());
    await expect.poll(() => server.uploads.length, { timeout: 30_000 }).toBe(1);

    const rows = recordsOf(server.uploads[0].data);
    const spoken = rows.find((row) => row.tag === "spoken")?.response ?? "";
    expect(Buffer.from(spoken, "base64").subarray(0, 4)).toEqual(
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    );
    expect(errors).toEqual([]);
    await page.close();
  });

  it("keeps its recordings inside the one file a downloading study saves", async () => {
    const { page, errors } = await record(recordingStudy({ save: "download" }));
    const download = await page.waitForEvent("download", { timeout: 30_000 });
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    const csv = await (await download.createReadStream()).toArray();
    const rows = recordsOf(Buffer.concat(csv).toString());
    expect(rows.find((row) => row.tag === "filmed")?.response.length).toBeGreaterThan(1_000);
    expect(errors).toEqual([]);
    await page.close();
  });
});
