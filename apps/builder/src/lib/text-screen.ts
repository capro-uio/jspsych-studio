import { round, svgText } from "./figure.ts";

/** A stretch of a line in one font and colour. */
export interface TextSpan {
  text: string;
  /** The families the page asked for, ending in a generic one, so any reader finds a font. */
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: "normal" | "italic" | "oblique";
  fill: string;
  opacity: number;
}

/** One line of text as the browser laid it out, in the captured page's pixels. */
export interface TextLine {
  /** Where the line is anchored: its left, middle or right, as its text is aligned. */
  x: number;
  baseline: number;
  anchor: "start" | "middle" | "end";
  spans: TextSpan[];
}

/** A screen that shows nothing but text, as lines to draw rather than a picture. */
export interface TextScreen {
  width: number;
  height: number;
  /** The page's own background, or null where it leaves the study's to show through. */
  background: string | null;
  lines: TextLine[];
}

/** A text screen as the capture frame measures it, in the browser's own terms. */
export interface MeasuredTextScreen {
  width: number;
  height: number;
  background: string | null;
  lines: {
    x: number;
    baseline: number;
    anchor: TextLine["anchor"];
    spans: {
      text: string;
      fontFamily: string;
      fontSize: number;
      fontWeight: string;
      fontStyle: string;
      colour: string;
    }[];
  }[];
}

/** What a screen is pictured as: a PNG of it, or its text when it shows nothing else. */
export type ScreenPicture = string | TextScreen;

export const isTextScreen = (picture: ScreenPicture): picture is TextScreen =>
  typeof picture !== "string";

/**
 * The text of the page as it is drawn, line by line, where the page shows nothing but text:
 * no images, canvas, video, form controls, boxes, shadows or transformed elements. Anything
 * else, or text it cannot place, makes it null, and the screen is pictured instead.
 *
 * It runs inside the capture frame from its source, so it uses nothing from outside itself.
 */
export function measureTextScreen(width: number, height: number): MeasuredTextScreen | null {
  const TEXT_TAGS = new Set(
    "DIV P SPAN B STRONG I EM SMALL BR CENTER FONT H1 H2 H3 H4 H5 H6 MAIN SECTION ARTICLE HEADER FOOTER BLOCKQUOTE PRE".split(
      " ",
    ),
  );
  const UNSEEN_TAGS = new Set("SCRIPT STYLE TEMPLATE NOSCRIPT LINK META".split(" "));
  const MAX_CHARACTERS = 2000;
  const transparent = (colour: string) =>
    colour === "transparent" || /^rgba\(.*,\s*0(\.0*)?\)$/.test(colour);
  const none = (style: CSSStyleDeclaration, property: string, ...also: string[]) => {
    const value = style.getPropertyValue(property);
    return value === "" || value === "none" || also.includes(value);
  };
  const noLength = (style: CSSStyleDeclaration, property: string) => {
    const value = style.getPropertyValue(property);
    return value === "" || value === "normal" || parseFloat(value) === 0;
  };
  const sides = ["top", "right", "bottom", "left"];
  const onlyText = (element: Element, style: CSSStyleDeclaration) =>
    style.opacity === "1" &&
    style.visibility === "visible" &&
    style.direction === "ltr" &&
    style.textAlign !== "justify" &&
    none(style, "transform") &&
    none(style, "filter") &&
    none(style, "clip-path") &&
    none(style, "mask-image") &&
    none(style, "background-image") &&
    none(style, "box-shadow") &&
    none(style, "text-shadow") &&
    none(style, "text-decoration-line") &&
    none(style, "text-transform") &&
    none(style, "font-variant-caps", "normal") &&
    none(style, "writing-mode", "horizontal-tb") &&
    noLength(style, "letter-spacing") &&
    noLength(style, "word-spacing") &&
    noLength(style, "-webkit-text-stroke-width") &&
    sides.every(
      (side) => none(style, `border-${side}-style`) || noLength(style, `border-${side}-width`),
    ) &&
    (none(style, "outline-style") || noLength(style, "outline-width")) &&
    ["::before", "::after"].every((pseudo) =>
      none(getComputedStyle(element, pseudo), "content", "normal"),
    );

  const context = document.createElement("canvas").getContext("2d");
  const fontOf = (style: CSSStyleDeclaration) =>
    `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const ascents = new Map<string, number | null>();
  // A range around text reaches from the font's ascent above the baseline to its descent below.
  const ascentShare = (style: CSSStyleDeclaration) => {
    const font = fontOf(style);
    if (!ascents.has(font)) {
      let share: number | null = null;
      if (context) {
        context.font = font;
        const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } =
          context.measureText("x");
        if (ascent > 0 && descent >= 0) share = ascent / (ascent + descent);
      }
      ascents.set(font, share);
    }
    return ascents.get(font) ?? null;
  };

  interface Mark {
    text: string;
    left: number;
    right: number;
    baseline: number;
    style: CSSStyleDeclaration;
    key: string;
  }
  const marks: Mark[] = [];
  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const range = document.createRange();
  const keepsSpaces = (style: CSSStyleDeclaration) => /pre|break-spaces/.test(style.whiteSpace);

  const texts: { node: Text; style: CSSStyleDeclaration }[] = [];
  const readElement = (element: Element, isRoot: boolean): boolean => {
    if (UNSEEN_TAGS.has(element.tagName)) return true;
    const style = getComputedStyle(element);
    if (style.display === "none") return true;
    if (!isRoot && !TEXT_TAGS.has(element.tagName)) return false;
    if (!onlyText(element, style)) return false;
    if (!isRoot && !transparent(style.backgroundColor)) return false;
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) texts.push({ node: child as Text, style });
      if (child.nodeType === Node.ELEMENT_NODE && !readElement(child as Element, false)) {
        return false;
      }
    }
    return true;
  };

  const readText = (node: Text, style: CSSStyleDeclaration) => {
    const key = `${fontOf(style)}|${style.color}`;
    for (const { segment, index } of graphemes.segment(node.data)) {
      range.setStart(node, index);
      range.setEnd(node, index + segment.length);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (segment === "\t" && keepsSpaces(style)) return false;
      if (rect.left < 0 || rect.top < 0 || rect.right > width || rect.bottom > height) return false;
      const share = ascentShare(style);
      if (share === null || marks.length >= MAX_CHARACTERS) return false;
      marks.push({
        text: /^\s+$/.test(segment) ? " " : segment,
        left: rect.left,
        right: rect.right,
        baseline: rect.top + rect.height * share,
        style,
        key,
      });
    }
    return true;
  };

  if (!readElement(document.body, true)) return null;
  if (!texts.every(({ node, style }) => readText(node, style))) return null;

  const lines: Mark[][] = [];
  for (const mark of marks) {
    const line = lines.at(-1);
    const last = line?.at(-1);
    const continues =
      last !== undefined &&
      Math.abs(mark.baseline - last.baseline) <= 1 &&
      Math.abs(mark.left - last.right) <= 1;
    if (continues) line!.push(mark);
    else if (mark.text !== " ") lines.push([mark]);
  }

  const backgrounds = [document.body, document.documentElement].map(
    (element) => getComputedStyle(element).backgroundColor,
  );
  const measured: MeasuredTextScreen = {
    width,
    height,
    background: backgrounds.find((colour) => !transparent(colour)) ?? null,
    lines: lines.map((line) => {
      while (line.at(-1)!.text === " ") line.pop();
      const first = line[0];
      const last = line.at(-1)!;
      const align = first.style.textAlign;
      const anchor = align.includes("center")
        ? "middle"
        : align.includes("right") || align === "end"
          ? "end"
          : "start";
      const x = { start: first.left, middle: (first.left + last.right) / 2, end: last.right };
      const spans: { key: string; text: string; style: CSSStyleDeclaration }[] = [];
      for (const mark of line) {
        const span = spans.at(-1);
        if (span?.key === mark.key) span.text += mark.text;
        else spans.push({ key: mark.key, text: mark.text, style: mark.style });
      }
      return {
        x: x[anchor],
        baseline: first.baseline,
        anchor,
        spans: spans.map(({ text, style }) => ({
          text,
          fontFamily: style.fontFamily,
          fontSize: parseFloat(style.fontSize),
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          colour: style.color,
        })),
      };
    }),
  };
  return measured;
}

const MAX_SIZE = 4000;
const MAX_LINES = 200;
const MAX_CHARACTERS = 2000;
const MAX_FONT_SIZE = 1000;

const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
]);
const QUOTED_FAMILY = /^(["'])([\w .-]+)\1$/;
const BARE_FAMILY = /^[\w .-]+$/;

/**
 * A font-family list as a figure can name it, quoted for an attribute, with a generic family
 * last so the text still shows where none of the named fonts is installed. Null for anything
 * but plain family names.
 */
export function fontFamilyList(value: string) {
  if (value.length > 500) return null;
  const families: string[] = [];
  for (const part of value.split(",").map((each) => each.trim())) {
    const quoted = QUOTED_FAMILY.exec(part);
    const name = quoted ? quoted[2].trim() : BARE_FAMILY.test(part) ? part : null;
    if (!name) return null;
    families.push(GENERIC_FAMILIES.has(name) ? name : `'${name}'`);
  }
  if (!families.some((family) => GENERIC_FAMILIES.has(family))) families.push("sans-serif");
  return families.join(", ");
}

const RGB = /^rgba?\((\d{1,3}), ?(\d{1,3}), ?(\d{1,3})(?:, ?(0|1|0?\.\d+))?\)$/;

/** A computed `rgb()` or `rgba()` colour as hex and opacity; null for any other notation. */
export function cssColour(value: string) {
  const match = RGB.exec(value);
  if (!match) return null;
  const channels = match.slice(1, 4).map(Number);
  if (channels.some((channel) => channel > 255)) return null;
  const hex = `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  return { hex, opacity: match[4] === undefined ? 1 : Number(match[4]) };
}

const WEIGHT = /^(normal|bold|[1-9]\d{0,2})$/;
const STYLES = new Set(["normal", "italic", "oblique"]);
const ANCHORS = new Set(["start", "middle", "end"]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const within = (value: unknown, low: number, high: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;

function readSpan(value: unknown): TextSpan | null {
  if (!isObject(value)) return null;
  const { text, fontFamily, fontSize, fontWeight, fontStyle, colour } = value;
  if (typeof text !== "string" || text.length === 0) return null;
  if (!within(fontSize, 0.1, MAX_FONT_SIZE)) return null;
  if (typeof fontWeight !== "string" || !WEIGHT.test(fontWeight)) return null;
  if (typeof fontStyle !== "string" || !STYLES.has(fontStyle)) return null;
  const family = typeof fontFamily === "string" ? fontFamilyList(fontFamily) : null;
  const fill = typeof colour === "string" ? cssColour(colour) : null;
  if (!family || !fill) return null;
  return {
    text,
    fontFamily: family,
    fontSize,
    fontWeight,
    fontStyle: fontStyle as TextSpan["fontStyle"],
    fill: fill.hex,
    opacity: fill.opacity,
  };
}

/**
 * A text screen as the capture frame describes it, checked through: the frame runs the
 * author's own code, which could send anything, and what is read here goes into the figure's
 * markup. Null unless every part of it is what the measuring sends.
 */
export function readTextScreen(value: unknown): TextScreen | null {
  if (!isObject(value)) return null;
  const { width, height, background, lines } = value;
  if (!within(width, 1, MAX_SIZE) || !within(height, 1, MAX_SIZE)) return null;
  if (!Array.isArray(lines) || lines.length > MAX_LINES) return null;
  let backgroundFill: string | null = null;
  if (background !== null) {
    const colour = typeof background === "string" ? cssColour(background) : null;
    if (!colour || colour.opacity !== 1) return null;
    backgroundFill = colour.hex;
  }
  const read: TextLine[] = [];
  let characters = 0;
  for (const line of lines) {
    if (!isObject(line) || !Array.isArray(line.spans)) return null;
    if (line.spans.length === 0 || line.spans.length > MAX_CHARACTERS - characters) return null;
    const { x, baseline, anchor } = line;
    if (!within(x, 0, width) || !within(baseline, 0, height)) return null;
    if (typeof anchor !== "string" || !ANCHORS.has(anchor)) return null;
    const spans = line.spans.map(readSpan);
    if (spans.some((span) => span === null)) return null;
    characters += spans.reduce((sum, span) => sum + span!.text.length, 0);
    if (characters > MAX_CHARACTERS) return null;
    read.push({ x, baseline, anchor: anchor as TextLine["anchor"], spans: spans as TextSpan[] });
  }
  return { width, height, background: backgroundFill, lines: read };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FONT_WEIGHT_NAMES: Record<string, string> = { "400": "normal", "700": "bold" };

function spanSvg(span: TextSpan, scale: number) {
  const attributes = [
    `font-family="${svgText(span.fontFamily)}"`,
    `font-size="${round(span.fontSize * scale)}"`,
    `font-weight="${FONT_WEIGHT_NAMES[span.fontWeight] ?? span.fontWeight}"`,
    span.fontStyle === "normal" ? "" : `font-style="${span.fontStyle}"`,
    `fill="${span.fill}"`,
    span.opacity === 1 ? "" : `fill-opacity="${span.opacity}"`,
  ].filter(Boolean);
  return `<tspan ${attributes.join(" ")}>${svgText(span.text)}</tspan>`;
}

/**
 * A text screen's lines as SVG text fitted into a screen's box, each where the browser drew it,
 * in the font, size, weight and colour it was drawn in, so the figure keeps it as text.
 */
export function textScreenSvg(screen: TextScreen, box: Box) {
  const scale = Math.min(box.width / screen.width, box.height / screen.height);
  const left = box.x + (box.width - screen.width * scale) / 2;
  const top = box.y + (box.height - screen.height * scale) / 2;
  return screen.lines
    .map(
      (line) =>
        `<text x="${round(left + line.x * scale)}" y="${round(top + line.baseline * scale)}" text-anchor="${line.anchor}" xml:space="preserve">${line.spans.map((span) => spanSvg(span, scale)).join("")}</text>`,
    )
    .join("");
}
