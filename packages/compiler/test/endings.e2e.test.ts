import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { emitHtml } from "../src/targets/html.ts";
import type { Ending, Spec } from "../src/types.ts";
import { serveDirectory, type StaticServer } from "./server.ts";
import { schemas } from "./schemas.ts";

const PAGE_NAME = "endings.e2e.html";
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const PLATFORM = "https://platform.example";
const THANKS: Ending = { message: "<p>Thank you anyway.</p>" };

let browser: Browser;
let server: StaticServer;

interface Study {
  noConsent: Ending;
  /** Where the data goes; uploading to the test server unless a test says otherwise. */
  data?: Spec["data"] | null;
}

// Pressing n declines consent and reaches the no_consent ending; y goes on to the task.
function spec({ noConsent, data }: Study): Spec {
  const saving =
    data === undefined
      ? { save: "post" as const, experiment_id: "testExperiment", endpoint: server.url }
      : (data ?? undefined);
  const complete: Record<string, Ending> =
    saving?.save === "post" ? { complete: { url: `${PLATFORM}/complete` } } : {};
  return {
    name: "consenting",
    data: saving,
    recruitment: { endings: { ...complete, no_consent: noConsent } },
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
        then: [{ kind: "end", ending: "no_consent" }],
      },
      {
        kind: "trial",
        plugin: "html-keyboard-response",
        params: { stimulus: "<p>the task</p>" },
      },
    ],
  };
}

async function answerConsent(study: Study, key: string, query = "participant_id=p1") {
  const { html } = await emitHtml(compileSpec(spec(study), schemas), {
    title: "consenting",
    base: "/node_modules",
  });
  writeFileSync(join(workspaceRoot, PAGE_NAME), html);

  const page = await browser.newPage({ acceptDownloads: true });
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  await page.route(`${PLATFORM}/**`, (route) => route.fulfill({ body: "back on the platform" }));
  await page.goto(`${server.url}/${PAGE_NAME}?${query}`);
  await page.locator("#jspsych-content").getByText("press y").waitFor();
  await page.keyboard.press(key);
  return { page, downloads };
}

async function shownMessage(page: Page) {
  await expect
    .poll(() => page.locator("body").innerText(), { timeout: 15_000 })
    .toContain("Thank you anyway.");
  return page.locator("body").innerText();
}

beforeAll(async () => {
  server = await serveDirectory(workspaceRoot);
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" });
}, 120_000);

afterEach(() => {
  server.uploads.length = 0;
  server.failUploads = false;
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
  rmSync(join(workspaceRoot, PAGE_NAME), { force: true });
});

describe("a participant who declines consent", () => {
  it("is shown the ending's message once their data is saved, and goes no further", async () => {
    const { page } = await answerConsent({ noConsent: THANKS }, "n");

    expect(await shownMessage(page)).not.toContain("the task");
    expect(server.uploads).toHaveLength(1);
    expect(server.uploads[0].data).toContain("no_consent");
    expect(page.url()).toContain(PAGE_NAME);
    await page.close();
  }, 120_000);

  it("is sent to the ending's address instead of the completion one", async () => {
    const { page } = await answerConsent({ noConsent: { url: `${PLATFORM}/declined` } }, "n");

    await page.waitForURL(`${PLATFORM}/declined`, { timeout: 15_000 });
    expect(server.uploads).toHaveLength(1);
    await page.close();
  }, 120_000);

  it("downloads their data first when the study saves it locally", async () => {
    const { page, downloads } = await answerConsent(
      { noConsent: THANKS, data: { save: "download" } },
      "n",
    );

    expect(await shownMessage(page)).not.toContain("the task");
    await expect.poll(() => downloads, { timeout: 15_000 }).toEqual(["consenting_p1.csv"]);
    expect(server.uploads).toHaveLength(0);
    await page.close();
  }, 120_000);

  it("is only shown the message when the study keeps no data", async () => {
    const { page, downloads } = await answerConsent({ noConsent: THANKS, data: null }, "n");

    expect(await shownMessage(page)).not.toContain("the task");
    expect(downloads).toEqual([]);
    expect(server.uploads).toHaveLength(0);
    await page.close();
  }, 120_000);

  it("is recorded as reaching the ending whatever the link says", async () => {
    const { page } = await answerConsent({ noConsent: THANKS }, "n", "participant_id=p1&ending=x");

    await shownMessage(page);
    expect(server.uploads[0].data).toContain("no_consent");
    expect(server.uploads[0].data).not.toMatch(/"x"/);
    await page.close();
  }, 120_000);
});

describe("a participant who agrees", () => {
  it("runs the study and completes it as usual", async () => {
    const { page } = await answerConsent({ noConsent: THANKS }, "y");

    await page.locator("#jspsych-content").getByText("the task").waitFor({ timeout: 10_000 });
    await page.keyboard.press("Space");
    await page.waitForURL(`${PLATFORM}/complete`, { timeout: 15_000 });
    expect(server.uploads).toHaveLength(1);
    expect(server.uploads[0].data).not.toContain("no_consent");
    await page.close();
  }, 120_000);
});
