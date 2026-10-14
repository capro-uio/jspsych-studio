import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { build, preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CONDITIONS_CSV = [
  "stim,correct_key,congruency",
  "<<<<<,f,congruent",
  ">>>>>,j,congruent",
  "<<><<,j,incongruent",
  ">><>>,f,incongruent",
].join("\n");

const INSTRUCTIONS =
  "<p>Press <b>f</b> for a left-pointing centre arrow, <b>j</b> for right.</p>" +
  "<p>Press any key to begin.</p>";

let browser: Browser;
let server: PreviewServer;
let appUrl: string;

async function setText(page: Page, testId: string, value: string) {
  const field = page.getByTestId(testId);
  await field.fill(value);
  await field.blur();
}

async function showAllParameters(page: Page) {
  const toggle = page.getByTestId("toggle-parameters");
  if ((await toggle.innerText()).startsWith("show all")) await toggle.click();
}

async function addTrial(page: Page, plugin: string) {
  await page.getByTestId("add-trial").click();
  await page.getByTestId("trial-plugin").selectOption(plugin);
}

async function setFixed(page: Page, parameter: string, value: string) {
  await showAllParameters(page);
  await page.getByTestId(`mode-${parameter}`).selectOption("fixed");
  await setText(page, `value-${parameter}`, value);
}

async function buildFlanker(page: Page) {
  await setText(page, "experiment-name", "flanker-practice");

  await setText(page, "table-name", "flanker_trials");
  await setText(page, "table-rows", CONDITIONS_CSV);
  await page.getByTestId("add-table").click();

  await addTrial(page, "html-keyboard-response");
  await setFixed(page, "stimulus", INSTRUCTIONS);

  await page.getByTestId("add-loop").click();
  await setText(page, "loop-id", "practice");

  await page.getByTestId("add-block").click();
  await setText(page, "block-repetitions", "2");
  await page.getByTestId("block-randomize").check();

  const blockPath = "node-1-0";
  await addTrial(page, "html-keyboard-response");
  await setFixed(page, "stimulus", "<p style='font-size:48px'>+</p>");
  await setFixed(page, "choices", "NO_KEYS");
  await setFixed(page, "trial_duration", "50");

  await page.getByTestId(blockPath).click();
  await addTrial(page, "html-keyboard-response");
  await setText(page, "trial-tag", "practice");
  await showAllParameters(page);
  await page.getByTestId("mode-stimulus").selectOption("column");
  await page.getByTestId("column-stimulus").selectOption("stim");
  await setText(page, "wrap-stimulus", "<p style='font-size:48px'>{}</p>");
  await setFixed(page, "choices", "f,j");
  await page.getByTestId("score-column").selectOption("correct_key");
  await page.getByTestId("record-congruency").check();
}

beforeAll(async () => {
  await build({ logLevel: "warn" });
  server = await preview({ preview: { port: 5181 }, logLevel: "warn" });
  appUrl = server.resolvedUrls?.local[0] ?? "http://localhost:5181/";
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server?.httpServer.close(() => resolve()));
});

describe("authoring the flanker task through the UI", () => {
  it("produces the reference spec and a running preview", async () => {
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(appUrl);

    await buildFlanker(page);

    await page.getByTestId("view-spec").click();
    const authored = JSON.parse(await page.getByTestId("spec-json").innerText());
    const reference = JSON.parse(
      readFileSync(new URL("../../../examples/flanker.json", import.meta.url), "utf8"),
    );
    expect(authored).toEqual(reference);

    await page.getByTestId("view-experiment").click();
    const preview = page.frameLocator('[data-testid="preview"]');
    await expect
      .poll(async () => preview.locator("#jspsych-content").innerText(), { timeout: 15_000 })
      .toContain("Press any key to begin");

    expect(pageErrors).toEqual([]);
    await page.close();
  }, 180_000);
});

describe("choosing where data goes", () => {
  it("warns when nothing is saved, and records the upload settings once chosen", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await addTrial(page, "html-keyboard-response");
    await setFixed(page, "stimulus", "<p>hello</p>");

    await expect(page.getByTestId("data-warning")).toBeDefined();
    expect(await page.getByTestId("data-warning").count()).toBe(1);

    await page.getByTestId("data-mode").selectOption("post");
    await expect
      .poll(() => page.getByTestId("compile-error").innerText(), { timeout: 5_000 })
      .toContain("needs an experiment id");

    await setText(page, "data-experiment-id", "abc123DEF456");
    await expect.poll(() => page.getByTestId("compile-error").count(), { timeout: 5_000 }).toBe(0);

    await page.getByTestId("view-spec").click();
    const spec = JSON.parse(await page.getByTestId("spec-json").innerText());
    expect(spec.data).toEqual({ save: "post", experiment_id: "abc123DEF456" });

    await page.getByTestId("view-code").click();
    await expect
      .poll(() => page.getByTestId("generated-code").innerText(), { timeout: 5_000 })
      .toContain("pipe.jspsych.org/api/data/");

    await page.close();
  }, 120_000);
});

describe("using an image file", () => {
  it("embeds an added file and shows it in the running preview", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);

    await page
      .getByTestId("add-assets")
      .setInputFiles(fileURLToPath(new URL("./fixtures/square.png", import.meta.url)));
    await expect
      .poll(() => page.getByTestId("asset-message").innerText(), { timeout: 5_000 })
      .toContain("square.png");

    await addTrial(page, "image-keyboard-response");
    await showAllParameters(page);
    await page.getByTestId("mode-stimulus").selectOption("fixed");
    await page.getByTestId("value-stimulus").selectOption("square.png");

    await page.getByTestId("view-spec").click();
    const spec = JSON.parse(await page.getByTestId("spec-json").innerText());
    expect(spec.assets).toHaveLength(1);
    expect(spec.assets[0].name).toBe("square.png");
    expect(spec.assets[0].url.startsWith("data:image/png;base64,")).toBe(true);
    expect(spec.timeline[0].params.stimulus).toBe("square.png");

    await page.getByTestId("view-experiment").click();
    const preview = page.frameLocator('[data-testid="preview"]');
    // The plugin draws onto a canvas by default rather than inserting an <img>, so the proof that
    // the embedded file reached the participant is a canvas with the image's pixels on it.
    await expect
      .poll(() => preview.locator("#jspsych-content canvas").count(), { timeout: 20_000 })
      .toBe(1);
    await expect
      .poll(
        () =>
          preview.locator("#jspsych-content canvas").evaluate((element) => {
            const canvas = element as HTMLCanvasElement;
            const context = canvas.getContext("2d")!;
            const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
            return [data[0], data[1], data[2], data[3]].join(",");
          }),
        { timeout: 20_000 },
      )
      .toBe("220,50,47,255");

    await page.close();
  }, 180_000);
});

describe("a parameter that takes a list", () => {
  it("builds instruction pages and steps through them in the preview", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await addTrial(page, "instructions");

    await page.getByTestId("mode-pages").selectOption("fixed");
    await setText(page, "value-pages-0", "<p>Welcome to the study.</p>");
    await page.getByTestId("add-value-pages").click();
    await setText(page, "value-pages-1", "<p>Press Enter to start.</p>");

    await showAllParameters(page);
    await page.getByTestId("mode-show_clickable_nav").selectOption("fixed");
    await page.getByTestId("value-show_clickable_nav").check();

    await page.getByTestId("view-spec").click();
    const spec = JSON.parse(await page.getByTestId("spec-json").innerText());
    expect(spec.timeline[0].params.pages).toEqual([
      "<p>Welcome to the study.</p>",
      "<p>Press Enter to start.</p>",
    ]);
    expect(spec.timeline[0].params.show_clickable_nav).toBe(true);

    await page.getByTestId("view-experiment").click();
    const preview = page.frameLocator('[data-testid="preview"]');
    await expect
      .poll(() => preview.locator("#jspsych-content").innerText(), { timeout: 20_000 })
      .toContain("Welcome to the study");

    await preview.locator("#jspsych-instructions-next").click();
    await expect
      .poll(() => preview.locator("#jspsych-content").innerText(), { timeout: 10_000 })
      .toContain("Press Enter to start");

    await page.close();
  }, 180_000);
});

describe("a list whose entries are objects", () => {
  it("builds a Likert question and renders its scale in the preview", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await addTrial(page, "survey-likert");

    await page.getByTestId("mode-questions").selectOption("fixed");
    await setText(page, "value-questions-0-prompt", "I enjoyed this task");
    await page.getByTestId("add-value-questions-0-labels").click();
    await setText(page, "value-questions-0-labels-0", "disagree");
    await page.getByTestId("add-value-questions-0-labels").click();
    await setText(page, "value-questions-0-labels-1", "agree");

    await page.getByTestId("view-spec").click();
    const spec = JSON.parse(await page.getByTestId("spec-json").innerText());
    expect(spec.timeline[0].params.questions).toEqual([
      { prompt: "I enjoyed this task", labels: ["disagree", "agree"] },
    ]);

    await page.getByTestId("view-experiment").click();
    const preview = page.frameLocator('[data-testid="preview"]');
    await expect
      .poll(() => preview.locator("#jspsych-content").innerText(), { timeout: 20_000 })
      .toContain("I enjoyed this task");
    expect(await preview.locator('input[type="radio"]').count()).toBe(2);

    await page.close();
  }, 180_000);
});
