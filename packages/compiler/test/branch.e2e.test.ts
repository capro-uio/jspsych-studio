import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { emitHtml } from "../src/targets/html.ts";
import type { Spec } from "../src/types.ts";
import { serveDirectory, type StaticServer } from "./server.ts";
import { schemas } from "./schemas.ts";

const PAGE_NAME = "branch.e2e.html";
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

let browser: Browser;
let server: StaticServer;

// Two screening trials where "f" is correct, then a branch: 80% accuracy or better continues.
const spec: Spec = {
  name: "screening",
  conditions: { items: [{ answer: "f" }, { answer: "f" }] },
  timeline: [
    {
      kind: "block",
      conditions: "items",
      children: [
        {
          kind: "trial",
          plugin: "html-keyboard-response",
          tag: "screening",
          params: { stimulus: "<p>press f</p>", choices: ["f", "j"] },
          score: { correct_if_response_equals: { var: "answer" } },
        },
      ],
    },
    {
      kind: "branch",
      when: { scope: "screening", accuracy_at_least: 0.8 },
      then: [
        {
          kind: "trial",
          plugin: "html-keyboard-response",
          tag: "main",
          params: { stimulus: "<p>the study continues</p>" },
        },
      ],
      otherwise: [
        {
          kind: "trial",
          plugin: "html-keyboard-response",
          tag: "rejected",
          params: { stimulus: "<p>thank you for your time</p>" },
        },
      ],
    },
  ],
};

async function run(answers: string[]) {
  const { html } = await emitHtml(compileSpec(spec, schemas), {
    title: "screening",
    base: "/node_modules",
  });
  writeFileSync(join(workspaceRoot, PAGE_NAME), html);

  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.url}/${PAGE_NAME}`);

  for (const answer of answers) {
    await expect
      .poll(() => page.locator("#jspsych-content").innerText(), { timeout: 10_000 })
      .toContain("press f");
    await page.keyboard.press(answer);
  }

  await expect
    .poll(() => page.locator("#jspsych-content").innerText(), { timeout: 10_000 })
    .toMatch(/continues|thank you/);
  const shown = await page.locator("#jspsych-content").innerText();
  await page.close();
  return { shown, errors };
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

describe("a study that routes on performance", () => {
  it("continues when the participant passes screening", async () => {
    const { shown, errors } = await run(["f", "f"]);
    expect(errors).toEqual([]);
    expect(shown).toContain("the study continues");
  }, 120_000);

  it("takes the other path when they do not", async () => {
    const { shown } = await run(["j", "j"]);
    expect(shown).toContain("thank you for your time");
    expect(shown).not.toContain("the study continues");
  }, 120_000);

  it("takes the other path on a borderline score", async () => {
    const { shown } = await run(["f", "j"]);
    expect(shown).toContain("thank you for your time");
  }, 120_000);
});
