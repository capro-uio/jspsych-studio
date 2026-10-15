import { chromium, type Browser, type Page } from "playwright";
import { build, preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const VIEWPORTS = [
  { name: "desktop", width: 1500, height: 900, columns: true },
  { name: "small laptop", width: 1100, height: 700, columns: true },
  { name: "short window", width: 1400, height: 560, columns: true },
  { name: "tablet", width: 820, height: 700, columns: false },
  { name: "phone", width: 420, height: 780, columns: false },
];

let browser: Browser;
let server: PreviewServer;
let appUrl: string;

async function fillWithContent(page: Page) {
  await page.goto(appUrl);
  await page.getByTestId("example-stroop").click();
  // A scored trial inside the block, so the middle column has a long form in it.
  await page.getByTestId("node-2-1").click();
  const toggle = page.getByTestId("toggle-parameters");
  if ((await toggle.innerText()).startsWith("show all")) await toggle.click();
  await page.waitForTimeout(300);
}

/** How a person could bring an element into view: by scrolling the page, a panel, or neither. */
function reach(page: Page, testId: string) {
  return page.evaluate(async (id) => {
    const target = document.querySelector(`[data-testid="${id}"]`);
    if (!target) return "missing";
    // Start from the top, or a previous lookup may have left the page scrolled past this one.
    window.scrollTo(0, 0);
    for (const panel of document.querySelectorAll("aside, .form, .preview")) panel.scrollTop = 0;
    const inView = () => {
      const box = target.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight;
    };
    if (inView()) return "already visible";
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const containers = [window, ...document.querySelectorAll("aside, .form, .preview")];
    for (const container of containers) {
      for (let step = 0; step < 40; step += 1) {
        container.scrollBy(0, 200);
        await sleep(5);
        if (inView()) return "scrolled";
      }
    }
    return "unreachable";
  }, testId);
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

describe.each(VIEWPORTS)("at $name ($width×$height)", ({ width, height, columns }) => {
  it("lets you reach the bottom of the sidebar and of a long form", async () => {
    const page = await browser.newPage({ viewport: { width, height } });
    await fillWithContent(page);

    expect(await reach(page, "data-mode")).not.toBe("unreachable");
    expect(await reach(page, "toggle-parameters")).not.toBe("unreachable");

    await page.close();
  }, 120_000);

  it(
    columns ? "pins the shell so each column scrolls" : "scrolls the page",
    async () => {
      const page = await browser.newPage({ viewport: { width, height } });
      await fillWithContent(page);

      const overflow = await page.evaluate(() => {
        const html = document.documentElement;
        return {
          pageOverflow: html.scrollHeight - html.clientHeight,
          panelsScroll: [...document.querySelectorAll("aside, .form, .preview")].some(
            (panel) => getComputedStyle(panel).overflowY === "auto",
          ),
        };
      });

      if (columns) {
        // Nothing should sit below the fold of the shell itself; the panels take the scrolling.
        expect(overflow.pageOverflow).toBe(0);
        expect(overflow.panelsScroll).toBe(true);
      } else {
        expect(overflow.panelsScroll).toBe(false);
      }

      await page.close();
    },
    120_000,
  );
});

describe("resizing the panels", () => {
  it("drags a boundary, remembers it, and resets on double click", async () => {
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    await page.goto(appUrl);

    const widthOf = (selector: string) =>
      page.evaluate((css) => document.querySelector(css)!.getBoundingClientRect().width, selector);

    const before = await widthOf("aside");
    const divider = page.getByTestId("divider-0");
    const box = (await divider.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    const after = await widthOf("aside");
    expect(after).toBeGreaterThan(before + 100);

    // The choice survives a reload.
    await page.reload();
    expect(await widthOf("aside")).toBeGreaterThan(before + 100);

    await page.getByTestId("divider-0").dblclick();
    await expect.poll(() => widthOf("aside"), { timeout: 5_000 }).toBeLessThan(before + 50);

    await page.close();
  }, 120_000);

  it("takes the keyboard as well as the pointer", async () => {
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    await page.goto(appUrl);
    const widthOf = () =>
      page.evaluate(() => document.querySelector("aside")!.getBoundingClientRect().width);

    const before = await widthOf();
    await page.getByTestId("divider-0").focus();
    for (let press = 0; press < 3; press += 1) await page.keyboard.press("ArrowRight");
    expect(await widthOf()).toBeGreaterThan(before);

    await page.getByTestId("divider-0").dblclick();
    await page.close();
  }, 120_000);
});
