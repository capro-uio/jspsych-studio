import { readFileSync, writeFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import type { Browser, Page } from "playwright";
import { build, preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchBrowser } from "./browser.ts";

let browser: Browser;
let server: PreviewServer;
let appUrl: string;

beforeAll(async () => {
  await build({ logLevel: "warn" });
  server = await preview({ preview: { port: 0 }, logLevel: "warn" });
  appUrl = server.resolvedUrls!.local[0];
  browser = await launchBrowser();
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 30_000);

/** The builder with an example open and the Figures view showing. */
async function openFigures(example: string) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  await page.goto(appUrl);
  await page.getByTestId(`example-${example}`).click();
  await page.getByTestId("view-figures").click();
  await page.getByTestId("figures").waitFor();
  return page;
}

async function downloaded(page: Page, click: () => Promise<void>) {
  const [file] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), click()]);
  return { name: file.suggestedFilename(), body: readFileSync(await file.path()) };
}

const images = (svg: string) => svg.match(/<image /g) ?? [];

/** The text drawn on a figure's screens, which are the only text with a font of its own. */
const screenText = (svg: string) =>
  [...svg.matchAll(/<tspan font-family="[^"]+"[^>]*>([^<]*)<\/tspan>/g)].map((match) => match[1]);

/** How many pixels of a picture are mostly blue, as the shapes example's square is. */
const bluePixels = (page: Page, png: string) =>
  page.evaluate(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    let blue = 0;
    for (let at = 0; at < data.length; at += 4) {
      if (data[at + 2] > 180 && data[at] < 100) blue += 1;
    }
    return blue;
  }, png);

describe("the Figures view", () => {
  it("shows each block, and downloads one whose screens of text stay text", async () => {
    const page = await openFigures("stroop");
    const block = page.getByTestId("figure-2");
    expect(await block.locator("h3").innerText()).toBe("Block · stroop_trials");
    expect(await block.getByTestId("figure-preview").getAttribute("data-pictured")).toBe("false");

    const { name, body } = await downloaded(page, () =>
      block.getByTestId("figure-download").click(),
    );
    expect(name).toMatch(/-block-stroop_trials\.svg$/);
    const svg = body.toString();
    expect(images(svg)).toHaveLength(0);
    expect(screenText(svg)).toEqual(["+", "RED"]);
    expect(svg).toContain(`font-family="'Open Sans', 'Arial', sans-serif"`);
    await expect
      .poll(() => block.getByTestId("figure-preview").getAttribute("data-pictured"))
      .toBe("true");
    await page.close();
  }, 150_000);

  it("pictures a step that shows an image, and keeps the fixation before it as text", async () => {
    const page = await openFigures("shapes");
    const block = page.getByTestId("figure-2");
    await block.getByTestId("figure-picture").click();
    await expect
      .poll(() => block.getByTestId("figure-preview").getAttribute("data-pictured"), {
        timeout: 60_000,
      })
      .toBe("true");
    const preview = await block
      .getByTestId("figure-preview")
      .evaluate((image: HTMLImageElement) => fetch(image.src).then((response) => response.text()));
    expect(images(preview)).toHaveLength(1);
    expect(screenText(preview)).toEqual(["+"]);
    const [png] = /data:image\/png;base64,[A-Za-z0-9+/=]+/.exec(preview)!;
    expect(await bluePixels(page, png)).toBeGreaterThan(1000);
    await page.close();
  }, 150_000);

  it("downloads a PNG sized for one column of a page, for the row chosen", async () => {
    const page = await openFigures("stroop");
    await page.getByTestId("figures-size").selectOption("single");
    await page.getByTestId("figures-format").selectOption("png");
    const block = page.getByTestId("figure-2");
    await block.getByTestId("figure-row").selectOption("1");
    const { name, body } = await downloaded(page, () =>
      block.getByTestId("figure-download").click(),
    );
    expect(name).toMatch(/\.png$/);
    expect(body.subarray(1, 4).toString()).toBe("PNG");
    const width = body.readUInt32BE(16);
    expect(width).toBeGreaterThan(900);
    expect(width).toBeLessThanOrEqual(Math.round((89 / 25.4) * 300));
    await page.close();
  }, 150_000);

  it("shows the screen that differs in each condition, side by side", async () => {
    const page = await openFigures("stroop");
    const block = page.getByTestId("figure-2");
    await block.getByTestId("figure-conditions").selectOption("congruency");
    const { body } = await downloaded(page, () => block.getByTestId("figure-download").click());
    const svg = body.toString();
    expect(svg).toContain("Conditions by congruency");
    expect(svg).toContain(">congruent<");
    expect(svg).toContain(">incongruent<");
    expect(images(svg)).toHaveLength(0);
    expect(screenText(svg)).toEqual(["+", "RED", "RED", "RED"]);
    expect(svg).toMatch(/fill="#0000ff">RED</);
    if (process.env.FIGURE_OUT) writeFileSync(process.env.FIGURE_OUT, svg);
    await page.close();
  }, 150_000);

  it("leaves the flow to the Flow view, whose download follows the format chosen here", async () => {
    const page = await openFigures("flanker");
    expect(await page.getByTestId("figure-flow").count()).toBe(0);
    await page.getByTestId("figures-format").selectOption("png");
    await page.getByTestId("view-flow").click();
    const button = page.getByTestId("download-flow-svg");
    expect(await button.innerText()).toBe("Download as PNG");
    const { name, body } = await downloaded(page, () => button.click());
    expect(name).toMatch(/-flow\.png$/);
    expect(body.subarray(1, 4).toString()).toBe("PNG");
    await page.close();
  }, 120_000);

  it("is remembered: the project download makes its figures as chosen here", async () => {
    const page = await openFigures("stroop");
    await page.getByTestId("figures-format").selectOption("png");
    await page.getByTestId("figure-2").getByTestId("figure-conditions").selectOption("congruency");
    const { body } = await downloaded(page, () => page.getByTestId("download-zip").click());
    const files = unzipSync(body);
    const svg = strFromU8(files["figures/block-stroop_trials.svg"]);
    expect(svg).toContain("Conditions by congruency");
    expect(images(svg)).toHaveLength(0);
    expect(strFromU8(files["figures/block-stroop_trials.png"].subarray(1, 4))).toBe("PNG");
    expect(strFromU8(files["README.md"])).toContain("`block-stroop_trials.png`");
    await page.close();
  }, 180_000);
});
