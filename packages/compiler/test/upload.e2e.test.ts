import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { emitHtml } from "../src/targets/html.ts";
import type { Spec } from "../src/types.ts";
import { serveDirectory, type StaticServer } from "./server.ts";
import { schemas } from "./schemas.ts";

const PAGE_NAME = "upload.e2e.html";
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

let browser: Browser;
let server: StaticServer;

const spec = (endpoint: string): Spec => ({
  name: "uploading",
  data: { save: "post", experiment_id: "testExperiment", endpoint },
  timeline: [
    {
      kind: "trial",
      plugin: "html-keyboard-response",
      tag: "probe",
      params: { stimulus: "<p>press any key</p>" },
    },
  ],
});

async function runExperiment(): Promise<Page> {
  const compiled = compileSpec(spec(server.url), schemas, {
    initEntries: "on_finish: () => { window.studioExperiment.finished = true; }",
  });
  const { html } = await emitHtml(compiled, { title: "uploading", base: "/node_modules" });
  writeFileSync(join(workspaceRoot, PAGE_NAME), html);

  const page = await browser.newPage();
  await page.goto(`${server.url}/${PAGE_NAME}?participant_id=p42`);
  await page.locator("#jspsych-content").waitFor();
  await page.keyboard.press("Space");
  return page;
}

beforeAll(async () => {
  server = await serveDirectory(workspaceRoot);
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
  rmSync(join(workspaceRoot, PAGE_NAME), { force: true });
});

describe("a compiled experiment that uploads its data", () => {
  it("posts the participant's rows to the configured endpoint", async () => {
    const page = await runExperiment();
    await expect.poll(() => server.uploads.length, { timeout: 15_000 }).toBe(1);

    const [upload] = server.uploads;
    expect(upload.experimentID).toBe("testExperiment");
    expect(upload.filename).toBe("uploading_p42.csv");
    expect(upload.data).toContain("participant_id");
    expect(upload.data).toContain("p42");
    expect(upload.data.split("\n").length).toBeGreaterThan(1);
    // The saving step has to end its own trial, or anything placed after it never runs.
    await expect
      .poll(() => page.evaluate(() => window.studioExperiment?.finished === true), {
        timeout: 15_000,
      })
      .toBe(true);
    await page.close();
  }, 120_000);

  it("tells the participant and downloads instead when the upload fails", async () => {
    server.uploads.length = 0;
    server.failUploads = true;
    const page = await runExperiment();

    await expect
      .poll(() => page.locator("#jspsych-content").innerText(), { timeout: 15_000 })
      .toContain("could not be uploaded");
    expect(server.uploads).toHaveLength(0);
    await expect
      .poll(() => page.evaluate(() => window.studioExperiment?.finished === true), {
        timeout: 15_000,
      })
      .toBe(true);
    server.failUploads = false;
    await page.close();
  }, 120_000);
});
