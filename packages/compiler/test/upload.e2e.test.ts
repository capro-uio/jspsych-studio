import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { emitHtml } from "../src/targets/html.ts";
import type { Spec } from "../src/types.ts";
import { serveDirectory, type StaticServer } from "./server.ts";
import { recordsOf } from "./csv.ts";
import { schemas } from "./schemas.ts";

const PAGE_NAME = "upload.e2e.html";
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

let browser: Browser;
let server: StaticServer;

const PLATFORM = "https://platform.example";

const spec = (endpoint: string, recruitment?: Spec["recruitment"]): Spec => ({
  name: "uploading",
  data: { save: "post", experiment_id: "testExperiment", endpoint },
  recruitment,
  timeline: [
    {
      kind: "trial",
      plugin: "html-keyboard-response",
      tag: "probe",
      params: { stimulus: "<p>press any key</p>" },
      record: { url_tag: "the study's own" },
    },
  ],
});

async function runExperiment(
  recruitment?: Spec["recruitment"],
  query = "participant_id=p42",
): Promise<Page> {
  const compiled = compileSpec(spec(server.url, recruitment), schemas, {
    initEntries: "on_finish: () => { window.studioExperiment.finished = true; }",
  });
  const { html } = await emitHtml(compiled, { title: "uploading", base: "/node_modules" });
  writeFileSync(join(workspaceRoot, PAGE_NAME), html);

  const page = await browser.newPage();
  // The platform is not really there; answering for it lets the test see where the page went.
  await page.route(`${PLATFORM}/**`, (route) => route.fulfill({ body: "back on the platform" }));
  await page.goto(`${server.url}/${PAGE_NAME}?${query}`);
  await page.locator("#jspsych-content").waitFor();
  await page.keyboard.press("Space");
  return page;
}

beforeAll(async () => {
  server = await serveDirectory(workspaceRoot);
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" });
}, 120_000);

// A failed assertion must not leave later tests uploading to a server that refuses everything.
afterEach(() => {
  server.uploads.length = 0;
  server.failUploads = false;
});

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
    await page.close();
  }, 120_000);
});

describe("a compiled experiment recruited from a platform", () => {
  const prolific: Spec["recruitment"] = {
    platform: "prolific",
    id_param: "PROLIFIC_PID",
    endings: { complete: { url: `${PLATFORM}/complete?cc=C1A2B3&pid={participant_id}` } },
  };

  it("files the data under the platform's id, then sends the participant back", async () => {
    // A participant_id left over in the link must not replace the platform's id.
    const page = await runExperiment(
      prolific,
      "participant_id=test&PROLIFIC_PID=pro%2042&STUDY_ID=s1",
    );

    await page.waitForURL(`${PLATFORM}/complete?cc=C1A2B3&pid=pro%2042`, { timeout: 15_000 });
    expect(server.uploads).toHaveLength(1);
    expect(server.uploads[0].filename).toBe("uploading_pro 42.csv");
    expect(server.uploads[0].data).toContain("s1");
    await page.close();
  }, 120_000);

  it("keeps the participant on the page with a way back when the upload fails", async () => {
    server.failUploads = true;
    const page = await runExperiment(prolific, "PROLIFIC_PID=p7");

    const link = page.getByRole("link", { name: "continue here to finish the study" });
    await link.waitFor({ timeout: 15_000 });
    expect(page.url()).toContain(PAGE_NAME);
    expect(await link.getAttribute("href")).toBe(`${PLATFORM}/complete?cc=C1A2B3&pid=p7`);
    await page.close();
  }, 120_000);
});

describe("a link carrying parameters named like the study's own columns", () => {
  it("records them beside the study's columns instead of over them", async () => {
    const page = await runExperiment(
      undefined,
      "participant_id=p42&tag=forged&response=forged&stimulus=forged&experiment=forged&campaign=spring",
    );
    await expect.poll(() => server.uploads.length, { timeout: 15_000 }).toBe(1);

    const trial = recordsOf(server.uploads[0].data).find(
      (record) => record.trial_type === "html-keyboard-response",
    );
    expect(trial).toMatchObject({
      tag: "probe",
      stimulus: "<p>press any key</p>",
      experiment: "uploading",
      participant_id: "p42",
      url_tag: "the study's own",
      url_url_tag: "forged",
      url_response: "forged",
      url_stimulus: "forged",
      url_experiment: "forged",
      campaign: "spring",
    });
    expect(trial?.response).not.toBe("forged");
    await page.close();
  }, 120_000);
});
