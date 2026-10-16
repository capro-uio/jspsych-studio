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

/** The sidebar is tabbed, so reaching conditions, files or study settings means opening that tab. */
async function openTab(page: Page, id: "timeline" | "conditions" | "files" | "study") {
  await page.getByTestId(`tab-${id}`).click();
}

async function showAllParameters(page: Page) {
  const toggle = page.getByTestId("toggle-parameters");
  if ((await toggle.innerText()).startsWith("show all")) await toggle.click();
}

/** Steps are added from the menu on a gap, so placement and kind are one choice. */
async function addStep(page: Page, slot: string, kind: string) {
  await page.getByTestId(slot).click();
  await page.getByTestId(`${slot}-${kind}`).click();
}

async function addTrial(page: Page, plugin: string, slot: string) {
  await addStep(page, slot, "trial");
  await page.getByTestId("trial-plugin").selectOption(plugin);
}

async function setFixed(page: Page, parameter: string, value: string) {
  await showAllParameters(page);
  await page.getByTestId(`mode-${parameter}`).selectOption("fixed");

  // A rich text field takes markup through its HTML view, the way a person pasting a snippet
  // would; typing into the formatted surface would insert the tags as literal text.
  const markupToggle = page.getByTestId(`value-${parameter}-markup`);
  if ((await markupToggle.count()) > 0) {
    await markupToggle.click();
    await setText(page, `value-${parameter}-html`, value);
    await markupToggle.click();
    return;
  }
  await setText(page, `value-${parameter}`, value);
}

async function buildFlanker(page: Page) {
  await setText(page, "experiment-name", "flanker-practice");

  await openTab(page, "conditions");
  await page.getByTestId("add-by-paste").click();
  await setText(page, "table-name", "flanker_trials");
  await setText(page, "table-rows", CONDITIONS_CSV);
  await page.getByTestId("add-table").click();
  await openTab(page, "timeline");

  await addTrial(page, "html-keyboard-response", "slot-0");
  await setFixed(page, "stimulus", INSTRUCTIONS);

  // A loop arrives holding a step; the block goes inside it and that first step is removed.
  await addStep(page, "slot-1", "loop");
  await setText(page, "loop-id", "practice");
  await addStep(page, "slot-1-1", "block");
  await page.getByTestId("delete-1-0").click();

  await page.getByTestId("node-1-0").click();
  await setText(page, "block-repetitions", "2");
  await page.getByTestId("block-randomize").check();

  // The block's own first step becomes the fixation.
  await page.getByTestId("node-1-0-0").click();
  await setFixed(page, "stimulus", "<p style='font-size:48px'>+</p>");
  await setFixed(page, "choices", "NO_KEYS");
  await setFixed(page, "trial_duration", "50");

  await addTrial(page, "html-keyboard-response", "slot-1-0-1");
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
  server = await preview({ preview: { port: 0 }, logLevel: "warn" });
  appUrl = server.resolvedUrls!.local[0];
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
    await addTrial(page, "html-keyboard-response", "slot-0");
    await setFixed(page, "stimulus", "<p>hello</p>");

    // The tab carries a mark while nothing is being kept, so the warning is not hidden behind it.
    expect(await page.getByTestId("tab-study").innerText()).toContain("•");

    await openTab(page, "study");
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

    await openTab(page, "files");
    await page
      .getByTestId("add-assets")
      .setInputFiles(fileURLToPath(new URL("./fixtures/square.png", import.meta.url)));
    await expect
      .poll(() => page.getByTestId("asset-message").innerText(), { timeout: 5_000 })
      .toContain("square.png");

    await openTab(page, "timeline");
    await addTrial(page, "image-keyboard-response", "slot-0");
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
  it("builds instruction pages in the formatted editor and steps through them", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await addTrial(page, "instructions", "slot-0");

    await page.getByTestId("mode-pages").selectOption("fixed");

    // Each page is written in the same formatted editor as any other text, so markup goes in
    // through its HTML view.
    const writePage = async (index: number, markup: string) => {
      await page.getByTestId(`value-pages-${index}-markup`).click();
      await setText(page, `value-pages-${index}-html`, markup);
      await page.getByTestId(`value-pages-${index}-markup`).click();
    };
    await writePage(0, "<p>Welcome to the study.</p>");
    await page.getByTestId("add-value-pages").click();
    await writePage(1, "<p>Press Enter to start.</p>");

    await showAllParameters(page);
    await page.getByTestId("mode-show_clickable_nav").selectOption("fixed");
    await page.getByTestId("value-show_clickable_nav").check();

    // Every page gets the formatted editor, not a bare one-line box.
    expect(await page.getByTestId("value-pages-0-bold").count()).toBe(1);
    expect(
      await page
        .getByTestId("value-pages-0")
        .evaluate((node) => node.getBoundingClientRect().height),
    ).toBeGreaterThan(80);

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
    await addTrial(page, "survey-likert", "slot-0");

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

describe("splitting participants between groups", () => {
  it("builds two groups and runs exactly one of them", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);

    await addStep(page, "slot-0", "assign");
    await setText(page, "group-name-0", "wide");
    await setText(page, "group-name-1", "narrow");
    await setText(page, "assign-column", "spacing");

    // Each group arrives with a step in it, so they only need their text.
    for (const [index, label] of ["wide", "narrow"].entries()) {
      await page.getByTestId(`node-0-${index}-0`).click();
      await setFixed(page, "stimulus", `<p>${label} condition</p>`);
    }

    await page.getByTestId("view-spec").click();
    const spec = JSON.parse(await page.getByTestId("spec-json").innerText());
    expect(spec.timeline[0].kind).toBe("assign");
    expect(spec.timeline[0].record_as).toBe("spacing");
    expect(spec.timeline[0].groups.map((group: { name: string }) => group.name)).toEqual([
      "wide",
      "narrow",
    ]);
    expect(spec.timeline[0].groups[0].children).toHaveLength(1);

    await page.getByTestId("view-experiment").click();
    const preview = page.frameLocator('[data-testid="preview"]');
    await expect
      .poll(() => preview.locator("#jspsych-content").innerText(), { timeout: 20_000 })
      .toMatch(/wide condition|narrow condition/);

    const shown = await preview.locator("#jspsych-content").innerText();
    const other = shown.includes("wide") ? "narrow condition" : "wide condition";
    expect(shown).not.toContain(other);

    await page.close();
  }, 180_000);
});

describe("routing on performance", () => {
  it("builds a branch with a step on each path", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);

    await addTrial(page, "html-keyboard-response", "slot-0");
    await setText(page, "trial-tag", "screening");
    await setFixed(page, "stimulus", "<p>screening</p>");

    await addStep(page, "slot-1", "branch");
    await setText(page, "branch-scope", "screening");
    await page.getByTestId("branch-comparison").selectOption("at_least");
    await setText(page, "branch-threshold", "0.75");

    // The first path arrives with a step; the other is empty until something is put in it.
    await page.getByTestId("node-1-0-0").click();
    await setFixed(page, "stimulus", "<p>continue</p>");

    await addTrial(page, "html-keyboard-response", "slot-1-1-0");
    await setFixed(page, "stimulus", "<p>stop</p>");

    await page.getByTestId("view-spec").click();
    const spec = JSON.parse(await page.getByTestId("spec-json").innerText());
    expect(spec.timeline[1]).toMatchObject({
      kind: "branch",
      when: { scope: "screening", accuracy_at_least: 0.75 },
    });
    expect(spec.timeline[1].then).toHaveLength(1);
    expect(spec.timeline[1].otherwise).toHaveLength(1);

    expect(await page.getByTestId("compile-error").count()).toBe(0);
    await page.close();
  }, 180_000);
});

describe("opening an example", () => {
  it("fills the timeline and runs it straight away", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);

    await page.getByTestId("example-stroop").click();

    await expect
      .poll(() => page.getByTestId("node-0").innerText(), { timeout: 5_000 })
      .toContain("instructions");
    expect(await page.getByTestId("compile-error").count()).toBe(0);

    const preview = page.frameLocator('[data-testid="preview"]');
    await expect
      .poll(() => preview.locator("#jspsych-content").innerText(), { timeout: 20_000 })
      .toContain("colour words");

    await page.close();
  }, 180_000);
});

describe("working with what is already there", () => {
  it("opens a conditions table, edits a cell, and starts over", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await page.getByTestId("example-flanker").click();

    await openTab(page, "conditions");
    await page.getByTestId("open-table-flanker_trials").click();
    await expect(page.getByTestId("grid-flanker_trials")).toBeDefined();
    expect(await page.getByTestId("cell-flanker_trials-0-congruency").inputValue()).toBe(
      "congruent",
    );

    await setText(page, "cell-flanker_trials-0-stim", "^^^^^");
    await page.getByTestId("add-row-flanker_trials").click();

    await page.getByTestId("view-spec").click();
    const spec = JSON.parse(await page.getByTestId("spec-json").innerText());
    expect(spec.conditions.flanker_trials[0].stim).toBe("^^^^^");
    expect(spec.conditions.flanker_trials).toHaveLength(5);

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByTestId("new-project").click();
    await expect
      .poll(() => page.getByTestId("example-flanker").count(), { timeout: 5_000 })
      .toBe(1);

    await page.close();
  }, 120_000);

  it("carries experiment-wide settings into the generated code", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await page.getByTestId("example-flanker").click();

    await openTab(page, "study");
    await setText(page, "setting-default-iti", "250");
    await page.getByTestId("setting-progress-bar").check();

    await page.getByTestId("view-code").click();
    await expect
      .poll(() => page.getByTestId("generated-code").innerText(), { timeout: 5_000 })
      .toContain("default_iti: 250");
    expect(await page.getByTestId("generated-code").innerText()).toContain(
      "show_progress_bar: true",
    );

    await page.close();
  }, 120_000);
});

describe("writing stimulus text", () => {
  it("formats without typing HTML, and still lets you edit the markup", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await addTrial(page, "html-keyboard-response", "slot-0");
    await page.getByTestId("mode-stimulus").selectOption("fixed");

    const surface = page.getByTestId("value-stimulus");
    await surface.click();
    await page.keyboard.type("Welcome");
    await page.keyboard.press("ControlOrMeta+a");
    await page.getByTestId("value-stimulus-bold").click();
    await page.getByTestId("value-stimulus-size").selectOption("48px");

    await page.getByTestId("view-spec").click();
    const authored = JSON.parse(await page.getByTestId("spec-json").innerText());
    const stimulus = authored.timeline[0].params.stimulus as string;
    expect(stimulus).toContain("Welcome");
    expect(stimulus).toMatch(/<b>|font-weight|<strong>/);
    expect(stimulus).toContain("48px");

    // The preview shows it the way the participant will see it.
    await page.getByTestId("view-experiment").click();
    const preview = page.frameLocator('[data-testid="preview"]');
    await expect
      .poll(() => preview.locator("#jspsych-content").innerText(), { timeout: 20_000 })
      .toContain("Welcome");

    // The markup is still reachable for anyone who wants it.
    await page.getByTestId("value-stimulus-markup").click();
    const html = page.getByTestId("value-stimulus-html");
    expect(await html.inputValue()).toContain("Welcome");
    await html.fill("<p>typed as markup</p>");
    await html.blur();
    await page.getByTestId("view-spec").click();
    const edited = JSON.parse(await page.getByTestId("spec-json").innerText());
    expect(edited.timeline[0].params.stimulus).toBe("<p>typed as markup</p>");

    await page.close();
  }, 180_000);

  it("colours text even though the picker takes the focus away", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await addTrial(page, "html-keyboard-response", "slot-0");
    await page.getByTestId("mode-stimulus").selectOption("fixed");

    await page.getByTestId("value-stimulus").click();
    await page.keyboard.type("colour me");

    // The native colour picker moves focus out of the editor before the change is reported,
    // which is what used to lose the selection and silently apply nothing.
    await page.getByTestId("trial-tag").click();
    await page.getByTestId("value-stimulus-colour").evaluate((node) => {
      (node as HTMLInputElement).value = "#cc0000";
      node.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await page.getByTestId("view-spec").click();
    const spec = JSON.parse(await page.getByTestId("spec-json").innerText());
    const stimulus = spec.timeline[0].params.stimulus as string;
    expect(stimulus).toContain("colour me");
    expect(stimulus).toMatch(/color: rgb\(204, 0, 0\)|#cc0000/i);

    await page.close();
  }, 120_000);

  it("writes text against the backdrop the participant will see", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await addTrial(page, "html-keyboard-response", "slot-0");
    await page.getByTestId("mode-stimulus").selectOption("fixed");

    const surfaceBackground = () =>
      page.getByTestId("value-stimulus").evaluate((node) => getComputedStyle(node).backgroundColor);

    // Default: jsPsych runs on white, so the editor is white whatever the builder's own theme is.
    expect(await surfaceBackground()).toBe("rgb(255, 255, 255)");

    await openTab(page, "study");
    await page.getByTestId("setting-background").evaluate((node) => {
      (node as HTMLInputElement).value = "#101014";
      node.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // The editor follows the experiment, so light text on a dark stimulus screen stays readable.
    await expect.poll(surfaceBackground, { timeout: 5_000 }).toBe("rgb(16, 16, 20)");

    await page.getByTestId("view-experiment").click();
    const preview = page.frameLocator('[data-testid="preview"]');
    await expect
      .poll(
        () => preview.locator("body").evaluate((node) => getComputedStyle(node).backgroundColor),
        { timeout: 20_000 },
      )
      .toBe("rgb(16, 16, 20)");

    await page.close();
  }, 120_000);

  it("gives the field room to show more than a line or two", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await addTrial(page, "html-keyboard-response", "slot-0");
    await page.getByTestId("mode-stimulus").selectOption("fixed");

    const height = await page
      .getByTestId("value-stimulus")
      .evaluate((node) => node.getBoundingClientRect().height);
    expect(height).toBeGreaterThan(80);

    await page.close();
  }, 120_000);
});

describe("finding things in the sidebar", () => {
  it("keeps each group of settings on its own tab", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await page.getByTestId("example-flanker").click();

    // A long timeline no longer pushes everything else out of sight.
    expect(await page.getByTestId("data-mode").count()).toBe(0);
    expect(await page.getByTestId("node-0").count()).toBe(1);

    await openTab(page, "study");
    expect(await page.getByTestId("data-mode").count()).toBe(1);
    expect(await page.getByTestId("node-0").count()).toBe(0);

    await openTab(page, "conditions");
    expect(await page.getByTestId("open-table-flanker_trials").count()).toBe(1);

    await openTab(page, "files");
    expect(await page.getByTestId("add-assets").count()).toBe(1);

    await page.close();
  }, 120_000);

  it("marks the study tab while results are going nowhere", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);

    // An empty project has nothing to lose, so there is nothing to warn about.
    expect(await page.getByTestId("tab-study").innerText()).not.toContain("•");

    // The flanker example does not say where its data goes, and the mark says so.
    await page.getByTestId("example-flanker").click();
    await expect
      .poll(() => page.getByTestId("tab-study").innerText(), { timeout: 5_000 })
      .toContain("•");

    // The Stroop example downloads its results, so it is not flagged.
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByTestId("new-project").click();
    await page.getByTestId("example-stroop").click();
    await expect
      .poll(() => page.getByTestId("tab-study").innerText(), { timeout: 5_000 })
      .not.toContain("•");

    await page.close();
  }, 120_000);
});

describe("building a conditions table from a design", () => {
  it("crosses factors into rows without anyone writing a table", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await openTab(page, "conditions");

    await setText(page, "factor-table-name", "stroop_trials");
    await setText(page, "factor-name-0", "word");
    await setText(page, "factor-levels-0", "RED, BLUE");
    await setText(page, "factor-name-1", "ink");
    await setText(page, "factor-levels-1", "red, blue");

    // It says what it is about to make before making it.
    await expect
      .poll(() => page.getByTestId("factor-preview").innerText(), { timeout: 5_000 })
      .toContain("4 rows: word, ink");

    await page.getByTestId("build-table").click();

    // The new table opens so you can see what you got.
    await expect(page.getByTestId("grid-stroop_trials")).toBeDefined();
    expect(await page.getByTestId("cell-stroop_trials-0-word").inputValue()).toBe("RED");
    expect(await page.getByTestId("cell-stroop_trials-3-ink").inputValue()).toBe("blue");

    await openTab(page, "timeline");
    await addStep(page, "slot-0", "block");
    await page.getByTestId("view-spec").click();
    const spec = JSON.parse(await page.getByTestId("spec-json").innerText());
    expect(spec.conditions.stroop_trials).toHaveLength(4);
    expect(spec.conditions.stroop_trials[0]).toEqual({ word: "RED", ink: "red" });

    await page.close();
  }, 120_000);

  it("explains what is missing rather than building an empty table", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await openTab(page, "conditions");

    await setText(page, "factor-name-0", "word");
    await setText(page, "factor-levels-0", "RED, BLUE");
    await page.getByTestId("build-table").click();

    await expect
      .poll(() => page.getByTestId("factor-problem").first().innerText(), { timeout: 5_000 })
      .toContain("needs a name");
    expect(await page.getByTestId("grid-stroop_trials").count()).toBe(0);

    await page.close();
  }, 120_000);
});

describe("deciding where a step goes", () => {
  it("puts the next step at the chosen gap, not beside whatever is selected", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);

    await addTrial(page, "html-keyboard-response", "slot-0");
    await setFixed(page, "stimulus", "<p>first</p>");
    await addTrial(page, "html-keyboard-response", "slot-1");
    await setFixed(page, "stimulus", "<p>third</p>");

    // The gap between them, chosen while the last step added is the one being edited.
    await addTrial(page, "html-keyboard-response", "slot-1");
    await setFixed(page, "stimulus", "<p>second</p>");

    await page.getByTestId("view-spec").click();
    const spec = JSON.parse(await page.getByTestId("spec-json").innerText());
    expect(
      spec.timeline.map((step: { params: { stimulus: string } }) => step.params.stimulus),
    ).toEqual(["<p>first</p>", "<p>second</p>", "<p>third</p>"]);

    await page.close();
  }, 120_000);

  it("adds steps that are ready to run, and containers that already hold one", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);

    await addStep(page, "slot-0", "trial");
    // Nothing is half-built: a new step has text in it and the preview runs.
    expect(await page.getByTestId("compile-error").count()).toBe(0);

    await addStep(page, "slot-1", "loop");
    expect(await page.getByTestId("compile-error").count()).toBe(0);
    expect(await page.getByTestId("node-1-0").count()).toBe(1);

    const preview = page.frameLocator('[data-testid="preview"]');
    await expect
      .poll(() => preview.locator("#jspsych-content").innerText(), { timeout: 20_000 })
      .toContain("Your text here");

    await page.close();
  }, 120_000);

  it("says what each step does rather than what it is", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await page.getByTestId("example-flanker").click();

    expect(await page.getByTestId("node-1").innerText()).toContain("repeat while accuracy under");
    expect(await page.getByTestId("node-1-0").innerText()).toContain("once for each of 4 rows");
    expect(await page.getByTestId("node-1-0").innerText()).toContain("× 2");

    await page.close();
  }, 120_000);
});

describe("a step that is not ready says so itself", () => {
  it("marks the step rather than only shouting in the preview", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);

    await addTrial(page, "html-keyboard-response", "slot-0");
    expect(await page.getByTestId("issue-0").count()).toBe(0);

    // An image step cannot know which picture to show until a file is chosen.
    await page.getByTestId("trial-plugin").selectOption("image-keyboard-response");
    await expect.poll(() => page.getByTestId("issue-0").count(), { timeout: 5_000 }).toBe(1);
    expect(await page.getByTestId("issue-0").getAttribute("title")).toContain("requires parameter");

    // The one that is fine is not marked.
    await addTrial(page, "html-keyboard-response", "slot-1");
    expect(await page.getByTestId("issue-1").count()).toBe(0);

    await page.close();
  }, 120_000);

  it("offers the kinds of step at the gap, and says why one is unavailable", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);

    await page.getByTestId("slot-0").click();
    const menu = page.getByTestId("slot-0-menu");
    await expect(menu).toBeDefined();
    expect(await menu.innerText()).toContain("Trial");
    expect(await menu.innerText()).toContain("repeat steps until performance is good enough");

    // A block needs a table to repeat over, so it is offered but not usable yet.
    expect(await page.getByTestId("slot-0-block").isDisabled()).toBe(true);
    expect(await menu.innerText()).toContain("needs a conditions table");

    await page.getByTestId("slot-0-cancel").click();
    expect(await page.getByTestId("slot-0-menu").count()).toBe(0);

    await page.close();
  }, 120_000);
});

describe("seeing one step without clicking through the rest", () => {
  it("runs the selected step, in the block it belongs to", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await page.getByTestId("example-stroop").click();

    const preview = page.frameLocator('[data-testid="preview"]');
    // From the start, the instructions come first.
    await expect
      .poll(() => preview.locator("#jspsych-content").innerText(), { timeout: 20_000 })
      .toContain("colour words");

    // Pick the scored trial, deep inside the block, and run only that.
    await page.getByTestId("node-2-1").click();
    await page.getByTestId("run-from-step").click();

    await expect
      .poll(() => preview.locator("#jspsych-content").innerText(), { timeout: 20_000 })
      .toMatch(/RED|BLUE/);
    expect(await page.getByTestId("preview-note").innerText()).toContain("selected step only");

    // Back to the whole thing.
    await page.getByTestId("run-from-step").click();
    await expect
      .poll(() => preview.locator("#jspsych-content").innerText(), { timeout: 20_000 })
      .toContain("colour words");

    await page.close();
  }, 180_000);

  it("never uploads from a preview, however the experiment saves data", async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await page.getByTestId("example-flanker").click();

    await openTab(page, "study");
    await page.getByTestId("data-mode").selectOption("post");
    await setText(page, "data-experiment-id", "realExperiment");

    await page.getByTestId("view-code").click();
    const generated = await page.getByTestId("generated-code").innerText();
    expect(generated).not.toContain("pipe.jspsych.org");
    expect(generated).not.toContain("realExperiment");

    // The exported file is the one that saves.
    await page.getByTestId("view-spec").click();
    const spec = JSON.parse(await page.getByTestId("spec-json").innerText());
    expect(spec.data).toEqual({ save: "post", experiment_id: "realExperiment" });

    await page.close();
  }, 120_000);
});
