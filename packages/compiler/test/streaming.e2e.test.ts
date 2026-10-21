import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Download } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { emitHtml } from "../src/targets/html.ts";
import type { Spec } from "../src/types.ts";
import { serveDirectory, type StaticServer } from "./server.ts";
import { recordsOf } from "./csv.ts";
import { schemas } from "./schemas.ts";

const PAGE_NAME = "streaming.e2e.html";
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const PLATFORM = "https://platform.example";

let browser: Browser;
let server: StaticServer;

// Pressing n ends the study early at the "declined" ending; any other key goes on to the end.
const spec = (recruitment?: Spec["recruitment"]): Spec => ({
  name: "streaming",
  data: { save: "post", experiment_id: "testExperiment", endpoint: server.url, stream: true },
  recruitment: {
    ...recruitment,
    endings: {
      declined: { message: "<p>Thank you anyway.</p>" },
      ...recruitment?.endings,
    },
  },
  timeline: [
    {
      kind: "trial",
      plugin: "html-keyboard-response",
      tag: "consent",
      params: { stimulus: "<p>press y to agree, n to decline</p>", choices: ["y", "n"] },
    },
    {
      kind: "branch",
      when: { scope: "consent", response_equals: "n" },
      then: [{ kind: "end", ending: "declined" }],
    },
  ],
});

async function runExperiment(key: string, recruitment?: Spec["recruitment"]) {
  const { html } = await emitHtml(compileSpec(spec(recruitment), schemas), {
    title: "streaming",
    base: "/node_modules",
  });
  writeFileSync(join(workspaceRoot, PAGE_NAME), html);

  const page = await browser.newPage({ acceptDownloads: true });
  const downloads: Download[] = [];
  page.on("download", (download) => downloads.push(download));
  await page.route(`${PLATFORM}/**`, (route) => route.fulfill({ body: "back on the platform" }));
  await page.goto(`${server.url}/${PAGE_NAME}?participant_id=p42`);
  await page.locator("#jspsych-content").getByText("press y").waitFor();
  await page.keyboard.press(key);
  return { page, downloads };
}

const shown = (page: Awaited<ReturnType<typeof runExperiment>>["page"]) =>
  page.locator("body").innerText();

beforeAll(async () => {
  server = await serveDirectory(workspaceRoot);
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" });
}, 120_000);

afterEach(() => {
  server.uploads.length = 0;
  server.sessions.length = 0;
  server.failUploads = false;
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
  rmSync(join(workspaceRoot, PAGE_NAME), { force: true });
});

describe("a compiled experiment that saves its data as it goes", () => {
  it("asks DataPipe to take its rows as they come, then uploads them all at the end", async () => {
    const { page } = await runExperiment("y");

    await expect.poll(() => shown(page), { timeout: 15_000 }).toContain("Your data has been saved");
    expect(server.sessions).toEqual([
      { experimentID: "testExperiment", filename: "streaming_p42.csv" },
    ]);
    expect(server.uploads).toHaveLength(1);
    const [upload] = server.uploads;
    expect(upload).toMatchObject({
      experimentID: "testExperiment",
      filename: "streaming_p42.csv",
      encoding: "gzip",
    });
    expect(recordsOf(upload.data).map((record) => record.participant_id)).toContain("p42");
    expect(await shown(page)).not.toContain("You may close this page");
    await page.close();
  }, 120_000);

  it("shows an early ending's message once the data is uploaded", async () => {
    const { page } = await runExperiment("n");

    await expect.poll(() => shown(page), { timeout: 15_000 }).toContain("Thank you anyway.");
    expect(server.uploads).toHaveLength(1);
    expect(server.uploads[0].data).toContain("declined");
    expect(await shown(page)).not.toContain("Saving your data");
    await page.close();
  }, 120_000);

  it("downloads the data and says so when the upload fails", async () => {
    server.failUploads = true;
    const { page, downloads } = await runExperiment("n");

    await expect.poll(() => shown(page), { timeout: 15_000 }).toContain("could not be uploaded");
    expect(await shown(page)).toContain("Thank you anyway.");
    await expect
      .poll(() => downloads.map((download) => download.suggestedFilename()), { timeout: 15_000 })
      .toEqual(["streaming_p42.csv"]);
    await page.close();
  }, 120_000);

  it("sends the participant back to the platform only after the upload", async () => {
    const { page } = await runExperiment("y", {
      endings: { complete: { url: `${PLATFORM}/complete?pid={participant_id}` } },
    });

    await page.waitForURL(`${PLATFORM}/complete?pid=p42`, { timeout: 15_000 });
    expect(server.uploads).toHaveLength(1);
    await page.close();
  }, 120_000);
});
