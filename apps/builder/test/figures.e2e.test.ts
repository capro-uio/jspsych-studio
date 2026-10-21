import { readFileSync, writeFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { chromium, type Browser, type Page } from "playwright";
import { build, preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let browser: Browser;
let server: PreviewServer;
let appUrl: string;

beforeAll(async () => {
  await build({ logLevel: "warn" });
  server = await preview({ preview: { port: 0 }, logLevel: "warn" });
  appUrl = server.resolvedUrls!.local[0];
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" });
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

describe("the Figures view", () => {
  it("shows the flow and each block, and downloads a block pictured as the participant sees it", async () => {
    const page = await openFigures("stroop");
    await page.getByTestId("figure-flow").waitFor();
    const block = page.getByTestId("figure-2");
    expect(await block.locator("h3").innerText()).toBe("Block · stroop_trials");
    expect(await block.getByTestId("figure-preview").getAttribute("data-pictured")).toBe("false");

    const { name, body } = await downloaded(page, () =>
      block.getByTestId("figure-download").click(),
    );
    expect(name).toMatch(/-block-stroop_trials\.svg$/);
    expect(images(body.toString())).toHaveLength(2);
    await expect
      .poll(() => block.getByTestId("figure-preview").getAttribute("data-pictured"))
      .toBe("true");
    await page.close();
  }, 150_000);

  it("pictures the screens into its preview, and pictures a step that shows an image", async () => {
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
    expect(images(preview)).toHaveLength(2);
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
    expect(images(svg)).toHaveLength(4);
    if (process.env.FIGURE_OUT) writeFileSync(process.env.FIGURE_OUT, svg);
    await page.close();
  }, 150_000);

  it("downloads the flow as a figure", async () => {
    const page = await openFigures("flanker");
    const { name, body } = await downloaded(page, () =>
      page.getByTestId("figure-flow-download").click(),
    );
    expect(name).toMatch(/-flow\.svg$/);
    expect(body.toString()).toContain("block · flanker_trials");
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
    expect(images(svg)).toHaveLength(4);
    expect(strFromU8(files["figures/block-stroop_trials.png"].subarray(1, 4))).toBe("PNG");
    expect(strFromU8(files["README.md"])).toContain("`block-stroop_trials.png`");
    await page.close();
  }, 180_000);
});
