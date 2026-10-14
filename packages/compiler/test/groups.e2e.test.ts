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

const PAGE_NAME = "groups.e2e.html";
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

let browser: Browser;
let server: StaticServer;

const study = (method: "random" | "balanced"): Spec => ({
  name: "between-subjects",
  data:
    method === "balanced"
      ? { save: "post", experiment_id: "testExperiment", endpoint: server.url }
      : undefined,
  timeline: [
    {
      kind: "assign",
      method,
      record_as: "condition",
      groups: ["alpha", "beta"].map((name) => ({
        name,
        children: [
          {
            kind: "trial",
            plugin: "html-keyboard-response",
            tag: name,
            params: { stimulus: `<p>${name} group</p>` },
          },
        ],
      })),
    },
  ],
});

async function run(spec: Spec) {
  const { html } = await emitHtml(compileSpec(spec, schemas), {
    title: spec.name,
    base: "/node_modules",
  });
  writeFileSync(join(workspaceRoot, PAGE_NAME), html);

  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.url}/${PAGE_NAME}`);
  // The display is legitimately empty while an asynchronous assignment is in flight, so wait for
  // content rather than for the element to become visible.
  await expect
    .poll(() => page.locator("#jspsych-content").innerText(), { timeout: 20_000 })
    .toContain("group");
  const shown = await page.locator("#jspsych-content").innerText();
  await page.keyboard.press("Space");
  const rows = (await page.evaluate(() => window.studioExperiment.jsPsych.data.get().values())) as {
    tag?: string;
    condition?: string;
  }[];
  await page.close();
  return { shown, rows, errors };
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

describe("a study that splits participants between groups", () => {
  it("runs exactly one group and records which", async () => {
    const { shown, rows, errors } = await run(study("random"));
    const seen = rows.filter((row) => row.tag);

    expect(errors).toEqual([]);
    expect(seen).toHaveLength(1);
    expect(["alpha", "beta"]).toContain(seen[0].tag);
    expect(shown).toContain(`${seen[0].tag} group`);
    expect(seen[0].condition).toBe(seen[0].tag);
  }, 120_000);

  it("takes the group the data service hands out", async () => {
    server.nextCondition = 1;
    const second = await run(study("balanced"));
    expect(second.rows.find((row) => row.tag)?.tag).toBe("beta");

    server.nextCondition = 0;
    const first = await run(study("balanced"));
    expect(first.rows.find((row) => row.tag)?.tag).toBe("alpha");
  }, 120_000);
});
