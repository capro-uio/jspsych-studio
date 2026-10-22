// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { measureTextScreen } from "../src/lib/text-screen.ts";

// jsdom lays nothing out and computes few styles, so the page's layout is stated here: what
// each element's style computes to, and where each character of its text is drawn. The same
// measuring runs against real layout in the browser suite, text-screen.e2e.test.ts.

const INHERITED = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "color", "textAlign"];
const DEFAULTS: Record<string, string> = {
  display: "block",
  opacity: "1",
  visibility: "visible",
  direction: "ltr",
  textAlign: "start",
  whiteSpace: "normal",
  fontFamily: "Arial",
  fontSize: "10px",
  fontWeight: "400",
  fontStyle: "normal",
  color: "rgb(0, 0, 0)",
  backgroundColor: "rgba(0, 0, 0, 0)",
};
const TAG_DEFAULTS: Record<string, Record<string, string>> = {
  B: { fontWeight: "700" },
};

const camel = (property: string) =>
  property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

function computed(element: Element, pseudo?: string | null) {
  const own = (target: Element, name: string) =>
    (target as HTMLElement).style?.getPropertyValue(
      name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
    ) ||
    TAG_DEFAULTS[target.tagName]?.[name] ||
    "";
  const value = (name: string): string => {
    if (pseudo) return name === "content" ? "none" : "";
    const set = own(element, name);
    if (set) return set;
    if (INHERITED.includes(name)) {
      for (let at = element.parentElement; at; at = at.parentElement) {
        const inherited = own(at, name);
        if (inherited) return inherited;
      }
    }
    return DEFAULTS[name] ?? "";
  };
  return new Proxy({} as CSSStyleDeclaration, {
    get: (_, name: string) =>
      name === "getPropertyValue" ? (property: string) => value(camel(property)) : value(name),
  });
}

type Box = Pick<DOMRect, "left" | "top" | "right" | "bottom" | "width" | "height">;

const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

const places = new Map<Text, Map<number, Box>>();

/** Draws a text node's characters one after another, 10 wide, breaking lines where asked. */
function lay(node: Text, left: number, top: number, breaks: number[] = []) {
  const at = new Map<number, Box>();
  let x = left;
  let y = top;
  for (let index = 0; index < node.data.length; index++) {
    if (breaks.includes(index)) {
      x = left;
      y += 20;
    }
    at.set(index, box(x, y, 10, 20));
    x += 10;
  }
  places.set(node, at);
}

const textOf = (selector: string) => document.querySelector(selector)!.firstChild as Text;

let fontMetrics: { fontBoundingBoxAscent: number; fontBoundingBoxDescent: number } | null;

beforeEach(() => {
  fontMetrics = { fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 };
  vi.stubGlobal("getComputedStyle", computed);
  Range.prototype.getBoundingClientRect = function (this: Range) {
    const rect = places.get(this.startContainer as Text)?.get(this.startOffset);
    return (rect ?? box(0, 0, 0, 0)) as DOMRect;
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        font: "",
        measureText: () => fontMetrics ?? {},
      }) as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (Range.prototype as Partial<Range>).getBoundingClientRect;
  places.clear();
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
});

const span = (text: string, extra: Record<string, unknown> = {}) => ({
  text,
  fontFamily: "Arial",
  fontSize: 10,
  fontWeight: "400",
  fontStyle: "normal",
  colour: "rgb(0, 0, 0)",
  ...extra,
});

describe("measureTextScreen's reading of a laid-out page", () => {
  it("anchors a centred word at its middle, on its baseline", () => {
    document.body.innerHTML = `<p style="text-align: center; color: rgb(255, 0, 0)">RED</p>`;
    lay(textOf("p"), 385, 240);
    expect(measureTextScreen(800, 500)).toEqual({
      width: 800,
      height: 500,
      background: null,
      lines: [
        {
          x: 400,
          baseline: 256,
          anchor: "middle",
          spans: [span("RED", { colour: "rgb(255, 0, 0)" })],
        },
      ],
    });
  });

  it("follows the browser's line breaks, keeps a bold word in its line, and trims the ends", () => {
    document.body.innerHTML = `<p>Press <b>r</b> now or later</p>`;
    const [press, bold, rest] = [...document.querySelector("p")!.childNodes] as Text[];
    lay(press, 10, 10);
    lay(bold.firstChild as Text, 70, 10);
    lay(rest, 80, 10, [8]);
    const screen = measureTextScreen(800, 500)!;
    expect(screen.lines.map((line) => [line.x, line.anchor])).toEqual([
      [10, "start"],
      [80, "start"],
    ]);
    expect(screen.lines[0].spans).toEqual([
      span("Press "),
      span("r", { fontWeight: "700" }),
      span(" now or"),
    ]);
    expect(screen.lines[1].spans).toEqual([span("later")]);
  });

  it("anchors right-aligned text at its right edge", () => {
    document.body.innerHTML = `<div style="text-align: right">end</div>`;
    lay(textOf("div"), 700, 10);
    expect(measureTextScreen(800, 500)!.lines[0]).toMatchObject({ x: 730, anchor: "end" });
  });

  it("takes the page's background, and leaves out what is never drawn", () => {
    document.body.innerHTML = `<script>void 0</script><div style="display: none"><canvas></canvas></div>`;
    document.body.style.backgroundColor = "rgb(1, 2, 3)";
    expect(measureTextScreen(800, 500)).toEqual({
      width: 800,
      height: 500,
      background: "rgb(1, 2, 3)",
      lines: [],
    });
  });

  it.each([
    ["an image", `<img src="x.png">`],
    ["a list", `<ul><li>one</li></ul>`],
    ["a box with a border", `<div style="border-top-style: solid; border-top-width: 2px">x</div>`],
    ["a box with a background", `<div style="background-color: rgb(255, 255, 0)">x</div>`],
    ["faded text", `<p style="opacity: 0.5">x</p>`],
    ["justified text", `<p style="text-align: justify">x</p>`],
  ])("is null for a page with %s", (_, markup) => {
    document.body.innerHTML = markup;
    expect(measureTextScreen(800, 500)).toBeNull();
  });

  it("is null for text past the screen's edge", () => {
    document.body.innerHTML = `<p>below</p>`;
    lay(textOf("p"), 10, 490);
    expect(measureTextScreen(800, 500)).toBeNull();
  });

  it("is null for a tab kept as it is typed, whose width text cannot carry", () => {
    document.body.innerHTML = `<pre style="white-space: pre">a\tb</pre>`;
    lay(textOf("pre"), 10, 10);
    expect(measureTextScreen(800, 500)).toBeNull();
  });

  it("is null when the font's ascent cannot be measured", () => {
    document.body.innerHTML = `<p>x</p>`;
    lay(textOf("p"), 10, 10);
    fontMetrics = null;
    expect(measureTextScreen(800, 500)).toBeNull();
  });

  it("is null for more text than a screen of text holds", () => {
    document.body.innerHTML = `<p>${"x".repeat(2001)}</p>`;
    const node = textOf("p");
    places.set(
      node,
      new Map(Array.from({ length: 2001 }, (_, index) => [index, box(1, 1, 0.1, 1)])),
    );
    expect(measureTextScreen(800, 500)).toBeNull();
  });
});
