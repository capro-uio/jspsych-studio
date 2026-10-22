// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  cssColour,
  fontFamilyList,
  isTextScreen,
  readTextScreen,
  textScreenSvg,
  type TextScreen,
} from "../src/lib/text-screen.ts";

const span = (extra: Record<string, unknown> = {}) => ({
  text: "RED",
  fontFamily: '"Open Sans", Arial, sans-serif',
  fontSize: 48,
  fontWeight: "400",
  fontStyle: "normal",
  colour: "rgb(255, 0, 0)",
  ...extra,
});

const line = (extra: Record<string, unknown> = {}) => ({
  x: 400,
  baseline: 260,
  anchor: "middle",
  spans: [span()],
  ...extra,
});

const measured = (extra: Record<string, unknown> = {}) => ({
  width: 800,
  height: 500,
  background: "rgb(255, 255, 255)",
  lines: [line()],
  ...extra,
});

describe("fontFamilyList", () => {
  it("quotes each family and keeps the generic one last", () => {
    expect(fontFamilyList('"Open Sans", Arial, sans-serif')).toBe(
      "'Open Sans', 'Arial', sans-serif",
    );
    expect(fontFamilyList("'Courier New', monospace")).toBe("'Courier New', monospace");
  });

  it("ends a list without a generic family in one, so the text shows wherever it is opened", () => {
    expect(fontFamilyList('"Open Sans"')).toBe("'Open Sans', sans-serif");
  });

  it("refuses anything but plain family names", () => {
    expect(fontFamilyList('Arial"/><script>')).toBeNull();
    expect(fontFamilyList("url(x), serif")).toBeNull();
    expect(fontFamilyList("Arial, , serif")).toBeNull();
    expect(fontFamilyList(`${"a".repeat(501)}`)).toBeNull();
  });
});

describe("cssColour", () => {
  it("reads computed rgb and rgba colours as hex and opacity", () => {
    expect(cssColour("rgb(255, 0, 16)")).toEqual({ hex: "#ff0010", opacity: 1 });
    expect(cssColour("rgba(0, 0, 0, 0.5)")).toEqual({ hex: "#000000", opacity: 0.5 });
    expect(cssColour("rgba(0, 0, 0, 0)")).toEqual({ hex: "#000000", opacity: 0 });
  });

  it("refuses other notations, which a figure is not sure to show the same", () => {
    expect(cssColour("color(srgb 1 0 0)")).toBeNull();
    expect(cssColour("oklch(0.6 0.2 30)")).toBeNull();
    expect(cssColour("rgb(256, 0, 0)")).toBeNull();
    expect(cssColour("red")).toBeNull();
  });
});

describe("readTextScreen", () => {
  it("reads what the capture frame measures, in the figure's terms", () => {
    expect(readTextScreen(measured())).toEqual({
      width: 800,
      height: 500,
      background: "#ffffff",
      lines: [
        {
          x: 400,
          baseline: 260,
          anchor: "middle",
          spans: [
            {
              text: "RED",
              fontFamily: "'Open Sans', 'Arial', sans-serif",
              fontSize: 48,
              fontWeight: "400",
              fontStyle: "normal",
              fill: "#ff0000",
              opacity: 1,
            },
          ],
        },
      ],
    });
  });

  it("reads a page without a background of its own, and one with no text", () => {
    expect(readTextScreen(measured({ background: null, lines: [] }))).toEqual({
      width: 800,
      height: 500,
      background: null,
      lines: [],
    });
  });

  it.each([
    ["nothing", null],
    ["text alone", "RED"],
    ["a screen of no size", measured({ width: 0 })],
    ["a background seen through", measured({ background: "rgba(0, 0, 0, 0.5)" })],
    ["a background in another notation", measured({ background: "lab(50 0 0)" })],
    ["lines that are not a list", measured({ lines: {} })],
    ["too many lines", measured({ lines: Array.from({ length: 201 }, () => line()) })],
    ["a line off the screen", measured({ lines: [line({ x: 801 })] })],
    ["a line with no place", measured({ lines: [line({ baseline: Number.NaN })] })],
    ["a line aligned otherwise", measured({ lines: [line({ anchor: "justify" })] })],
    [
      "more spans than text a screen holds",
      measured({ lines: [line({ spans: Array.from({ length: 2001 }, () => span()) })] }),
    ],
    ["a line with nothing in it", measured({ lines: [line({ spans: [] })] })],
    ["a span with no text", measured({ lines: [line({ spans: [span({ text: "" })] })] })],
    ["a span of no size", measured({ lines: [line({ spans: [span({ fontSize: 0 })] })] })],
    ["a weight in words", measured({ lines: [line({ spans: [span({ fontWeight: "heavy" })] })] })],
    [
      "a slanted style",
      measured({ lines: [line({ spans: [span({ fontStyle: "oblique 10deg" })] })] }),
    ],
    [
      "a font that is not a name",
      measured({ lines: [line({ spans: [span({ fontFamily: "<x>" })] })] }),
    ],
    [
      "a colour in another notation",
      measured({ lines: [line({ spans: [span({ colour: "red" })] })] }),
    ],
    ["too much text", measured({ lines: [line({ spans: [span({ text: "x".repeat(2001) })] })] })],
  ])("refuses %s, so the screen is pictured instead", (_, value) => {
    expect(readTextScreen(value)).toBeNull();
  });
});

describe("isTextScreen", () => {
  it("tells text from a picture", () => {
    expect(isTextScreen("data:image/png;base64,AA==")).toBe(false);
    expect(isTextScreen(readTextScreen(measured())!)).toBe(true);
  });
});

const parse = (markup: string) =>
  new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`,
    "image/svg+xml",
  );

describe("textScreenSvg", () => {
  const screen = readTextScreen(
    measured({
      lines: [
        line(),
        line({
          x: 100,
          baseline: 400,
          anchor: "start",
          spans: [
            span({ text: "Press ", fontSize: 20, colour: "rgba(0, 0, 0, 0.5)" }),
            span({ text: "<r> & co", fontSize: 20, fontWeight: "700", fontStyle: "italic" }),
          ],
        }),
      ],
    }),
  ) as TextScreen;

  it("draws each line as text, scaled into the screen's box where the browser drew it", () => {
    const document = parse(textScreenSvg(screen, { x: 20, y: 30, width: 160, height: 100 }));
    expect(document.querySelector("parsererror")).toBeNull();
    const [word, prompt] = [...document.querySelectorAll("text")];
    expect(word.getAttribute("x")).toBe("100");
    expect(word.getAttribute("y")).toBe("82");
    expect(word.getAttribute("text-anchor")).toBe("middle");
    expect(word.querySelector("tspan")?.getAttribute("font-size")).toBe("9.6");
    expect(prompt.getAttribute("x")).toBe("40");
    expect(prompt.getAttribute("text-anchor")).toBe("start");
    expect(prompt.textContent).toBe("Press <r> & co");
  });

  it("names the font, and writes weight, slant and colour on each stretch", () => {
    const document = parse(textScreenSvg(screen, { x: 0, y: 0, width: 800, height: 500 }));
    const [press, rest] = [...document.querySelectorAll("text")[1].querySelectorAll("tspan")];
    expect(press.getAttribute("font-family")).toBe("'Open Sans', 'Arial', sans-serif");
    expect(press.getAttribute("font-weight")).toBe("normal");
    expect(press.getAttribute("fill")).toBe("#000000");
    expect(press.getAttribute("fill-opacity")).toBe("0.5");
    expect(press.hasAttribute("font-style")).toBe(false);
    expect(rest.getAttribute("font-weight")).toBe("bold");
    expect(rest.getAttribute("font-style")).toBe("italic");
    expect(rest.hasAttribute("fill-opacity")).toBe(false);
  });

  it("keeps a screen's shape inside a box of another shape, centred", () => {
    const document = parse(textScreenSvg(screen, { x: 0, y: 0, width: 160, height: 200 }));
    expect(document.querySelector("text")?.getAttribute("y")).toBe(`${50 + 260 * 0.2}`);
  });
});
