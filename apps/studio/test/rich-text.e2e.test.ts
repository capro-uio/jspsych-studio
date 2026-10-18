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
});

async function openProjectWithStimulus(page: Page, stimulus: string) {
  const spec = {
    name: "shared",
    timeline: [{ kind: "trial", plugin: "html-keyboard-response", params: { stimulus } }],
  };
  await page.getByTestId("header-menu").click();
  await page.getByTestId("import-spec").setInputFiles({
    name: "shared.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(spec)),
  });
  await page.getByTestId("node-0").click();
}

const ran = (page: Page) =>
  page.evaluate(() => (window as unknown as { scriptRan?: boolean }).scriptRan === true);

describe("text from a project someone else made", () => {
  it.each([
    '<img src="x" onerror="window.scriptRan = true">',
    '<p>hi</p><svg onload="window.scriptRan = true"></svg>',
    '<iframe srcdoc="<script>parent.scriptRan = true</script>"></iframe>',
    '<a href=" java\tscript:window.scriptRan = true">link</a>',
  ])(
    "is shown as HTML, without running in the builder: %s",
    async (stimulus) => {
      const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
      await page.goto(appUrl);
      await openProjectWithStimulus(page, stimulus);

      // Long enough for an image's error handler to have fired, had the markup been put live.
      await page.waitForTimeout(1_000);
      expect(await ran(page)).toBe(false);
      expect(await page.getByTestId("value-stimulus-script-note").count()).toBe(1);
      expect(await page.getByTestId("value-stimulus-html").inputValue()).toBe(stimulus);
      expect(await page.getByTestId("value-stimulus").count()).toBe(0);
      await page.close();
    },
    120_000,
  );

  it("still opens formatted text in the formatted editor", async () => {
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    await page.goto(appUrl);
    await openProjectWithStimulus(page, '<p style="color: red"><b>Press</b> any key</p>');

    await expect
      .poll(() => page.getByTestId("value-stimulus").innerText(), { timeout: 5_000 })
      .toBe("Press any key");
    expect(await page.getByTestId("value-stimulus-script-note").count()).toBe(0);
    await page.close();
  }, 120_000);
});
