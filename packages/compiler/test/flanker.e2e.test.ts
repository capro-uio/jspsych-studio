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

const WRONG_RESPONSES = 8;
const PAGE_NAME = "flanker.e2e.html";
const HOSTILE_PAGE = "hostile.e2e.html";
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

interface TrialRow {
  tag?: string;
  correct?: boolean;
  congruency?: string;
  rt: number | null;
}

const flip = (key: string) => (key === "f" ? "j" : "f");

async function driveExperiment(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(`${serverUrl}/${PAGE_NAME}`);

  let responses = 0;
  for (let step = 0; step < 400; step += 1) {
    if (await page.evaluate(() => Boolean(window.studioExperiment?.finished))) break;
    const content = (await page.locator("#jspsych-content").innerText()).trim().replace(/\s/g, "");
    if (/^[<>]{5}$/.test(content)) {
      responses += 1;
      const correctKey = content[2] === "<" ? "f" : "j";
      await page.keyboard.press(responses <= WRONG_RESPONSES ? flip(correctKey) : correctKey);
    } else if (content !== "+" && content !== "") {
      await page.keyboard.press("Space");
    }
    await page.waitForTimeout(25);
  }

  const rows = (await page.evaluate(() =>
    window.studioExperiment.jsPsych.data.get().values(),
  )) as TrialRow[];
  return { rows, errors };
}

let browser: Browser;
let server: StaticServer;
let serverUrl: string;

beforeAll(async () => {
  const spec = JSON.parse(
    readFileSync(join(workspaceRoot, "examples/flanker.json"), "utf8"),
  ) as Spec;
  const compiled = compileSpec(spec, schemas, {
    initOptions: "{ on_finish: () => { window.studioExperiment.finished = true; } }",
  });
  const { html } = await emitHtml(compiled, { title: spec.name, base: "/node_modules" });

  // Served from the workspace root so the `/node_modules` script tags resolve.
  writeFileSync(join(workspaceRoot, PAGE_NAME), html);
  server = await serveDirectory(workspaceRoot);
  serverUrl = server.url;
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
  rmSync(join(workspaceRoot, PAGE_NAME), { force: true });
  rmSync(join(workspaceRoot, HOSTILE_PAGE), { force: true });
});

describe("hostile strings in a compiled experiment", () => {
  it("survives a closing script tag and $-patterns in stimuli", async () => {
    const spec: Spec = {
      name: "hostile",
      conditions: { rows: [{ word: "cost $& total" }] },
      timeline: [
        {
          kind: "block",
          conditions: "rows",
          children: [
            {
              kind: "trial",
              plugin: "html-keyboard-response",
              params: {
                stimulus: { var: "word", wrap: "<p>closing tag </script> then {}</p>" },
              },
            },
          ],
        },
      ],
    };
    const { html } = await emitHtml(compileSpec(spec, schemas), {
      title: spec.name,
      base: "/node_modules",
    });
    writeFileSync(join(workspaceRoot, HOSTILE_PAGE), html);

    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${serverUrl}/${HOSTILE_PAGE}`);
    await page.waitForTimeout(400);

    // The rendered text drops the stray `</script>` because the HTML parser discards an unmatched
    // end tag; what matters is that the page still ran and the value survived verbatim.
    const shown = await page.locator("#jspsych-content").innerText();
    expect(errors).toEqual([]);
    expect(shown).toContain("cost $& total");
    expect(await page.evaluate(() => Boolean(window.studioExperiment?.jsPsych))).toBe(true);
    await page.close();
  }, 120_000);
});

describe("compiled flanker experiment", () => {
  it("runs to completion and produces the designed data", async () => {
    const page = await browser.newPage();
    const { rows, errors } = await driveExperiment(page);
    const practice = rows.filter((row) => row.tag === "practice");

    expect(errors).toEqual([]);
    expect(practice).toHaveLength(32);
    expect(practice.filter((row) => row.correct)).toHaveLength(24);
    expect(practice.slice(0, WRONG_RESPONSES).every((row) => row.correct === false)).toBe(true);
    expect(
      practice.reduce<Record<string, number>>((counts, row) => {
        counts[row.congruency ?? "unlabelled"] = (counts[row.congruency ?? "unlabelled"] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ congruent: 16, incongruent: 16 });
    expect(practice.every((row) => typeof row.rt === "number")).toBe(true);

    await page.close();
  }, 180_000);
});
