import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  measureTextScreen,
  readTextScreen,
  textScreenSvg,
  type TextScreen,
} from "../src/lib/text-screen.ts";
import { launchBrowser } from "./browser.ts";

const SIZE = { width: 800, height: 500 };
const FONT = "font-family: Arial, sans-serif";

let browser: Browser;

beforeAll(async () => {
  browser = await launchBrowser();
}, 60_000);

afterAll(async () => {
  await browser?.close();
}, 30_000);

/** A page laid out at the size screens are captured at, showing the markup given. */
async function pageShowing(body: string, style = "") {
  const page = await browser.newPage({ viewport: SIZE });
  await page.setContent(
    `<!doctype html><html><head><style>body { margin: 0; ${FONT}; ${style} }</style></head>` +
      `<body>${body}</body></html>`,
  );
  return page;
}

async function measured(page: Page) {
  return page.evaluate(
    ([source, width, height]) => {
      const measure = (0, eval)(`(${source})`) as (width: number, height: number) => unknown;
      return measure(width, height);
    },
    [measureTextScreen.toString(), SIZE.width, SIZE.height] as const,
  );
}

async function measure(body: string, style?: string) {
  const page = await pageShowing(body, style);
  try {
    return await measured(page);
  } finally {
    await page.close();
  }
}

/** Where ink falls on a page: the box around every pixel darker than the background. */
async function inkBox(page: Page) {
  const shot = await page.screenshot({ type: "png" });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { data: pixels } = context.getImageData(0, 0, image.width, image.height);
    const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const at = (y * image.width + x) * 4;
        if (pixels[at] + pixels[at + 1] + pixels[at + 2] > 600) continue;
        box.left = Math.min(box.left, x);
        box.top = Math.min(box.top, y);
        box.right = Math.max(box.right, x);
        box.bottom = Math.max(box.bottom, y);
      }
    }
    return box;
  }, shot.toString("base64"));
}

describe("measureTextScreen", () => {
  it("reads a centred word as one line, in the font, size and colour it is drawn in", async () => {
    const screen = readTextScreen(
      await measure(
        `<div style="text-align:center;padding-top:200px"><p style="font-size:48px;color:red">RED</p></div>`,
      ),
    );
    expect(screen).not.toBeNull();
    expect(screen!.lines).toHaveLength(1);
    const [line] = screen!.lines;
    expect(line.anchor).toBe("middle");
    expect(line.x).toBeCloseTo(400, 0);
    expect(line.baseline).toBeGreaterThan(200);
    expect(line.baseline).toBeLessThan(330);
    expect(line.spans).toEqual([
      {
        text: "RED",
        fontFamily: "'Arial', sans-serif",
        fontSize: 48,
        fontWeight: "400",
        fontStyle: "normal",
        fill: "#ff0000",
        opacity: 1,
      },
    ]);
  });

  it("breaks text where the browser wrapped it, and keeps bold words in their line", async () => {
    const screen = readTextScreen(
      await measure(
        `<p style="width:300px;font-size:20px">Press <b>r</b> if the ink is red and <b>b</b> if it is blue, as fast as you can.</p>`,
      ),
    )!;
    expect(screen.lines.length).toBeGreaterThan(1);
    const [first] = screen.lines;
    expect(first.anchor).toBe("start");
    expect(first.spans.map((span) => [span.text, span.fontWeight])).toEqual(
      expect.arrayContaining([["r", "700"]]),
    );
    expect(first.spans[0].text.startsWith("Press ")).toBe(true);
    const text = screen.lines.map((line) => line.spans.map((span) => span.text).join(""));
    expect(text.join(" ")).toBe(
      "Press r if the ink is red and b if it is blue, as fast as you can.",
    );
    expect(text.every((line) => line === line.trim())).toBe(true);
    const baselines = screen.lines.map((line) => line.baseline);
    expect(baselines).toEqual([...baselines].sort((a, b) => a - b));
  });

  it("reads an empty screen as no lines, on the page's background", async () => {
    const screen = readTextScreen(await measure("", "background: rgb(20, 30, 40)"));
    expect(screen).toEqual({ ...SIZE, background: "#141e28", lines: [] });
  });

  it.each([
    ["an image", `<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="40">`],
    ["a canvas", `<canvas width="40" height="40"></canvas>`],
    ["a button", `<p>Ready?</p><button>Continue</button>`],
    ["a form control", `<input value="typed">`],
    ["a drawing", `<svg width="40" height="40"><circle r="10" cx="20" cy="20"/></svg>`],
    ["a box with a border", `<div style="border:2px solid black">boxed</div>`],
    ["a box with a background", `<div style="background:yellow">marked</div>`],
    ["underlined text", `<p style="text-decoration:underline">underlined</p>`],
    ["rotated text", `<p style="transform:rotate(10deg)">tilted</p>`],
    ["text that is transformed", `<p style="text-transform:uppercase">shout</p>`],
    ["faded text", `<p style="opacity:0.5">faint</p>`],
    ["a list", `<ul><li>one</li></ul>`],
    ["text added by style", `<style>p::after { content: "!" }</style><p>hey</p>`],
    ["text past the screen's edge", `<p style="margin-top:600px">below</p>`],
  ])("pictures a screen with %s instead", async (_, body) => {
    expect(await measure(body)).toBeNull();
  });

  it("leaves out what is hidden or never drawn", async () => {
    const screen = readTextScreen(
      await measure(
        `<script>void 0</script><img hidden src="x.png"><div style="display:none"><canvas></canvas></div><p>shown</p>`,
      ),
    )!;
    expect(screen.lines.map((line) => line.spans[0].text)).toEqual(["shown"]);
  });
});

describe("a text screen drawn in a figure", () => {
  it("puts its text where the browser drew it", async () => {
    const body = `<div style="text-align:center;padding-top:180px"><p style="font-size:48px;color:#000">RED</p><p style="font-size:24px">Press <b>r</b> or <b>b</b></p></div>`;
    const page = await pageShowing(body);
    try {
      const screen = readTextScreen(await measured(page)) as TextScreen;
      const drawn = await inkBox(page);
      await page.setContent(
        `<!doctype html><html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="${SIZE.width}" height="${SIZE.height}">${textScreenSvg(screen, { x: 0, y: 0, ...SIZE })}</svg></body></html>`,
      );
      const redrawn = await inkBox(page);
      for (const side of ["left", "top", "right", "bottom"] as const) {
        expect(Math.abs(redrawn[side] - drawn[side])).toBeLessThanOrEqual(2);
      }
    } finally {
      await page.close();
    }
  });
});
