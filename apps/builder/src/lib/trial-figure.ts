import { backgroundColor, textColor, type ExperimentSettings, type Spec } from "@tachisto/compiler";
import { ARROW_ID, CHAR_WIDTH, figureSvg, ink, svgText, textWidth } from "./figure.ts";
import { specFilename } from "./files.ts";
import type { Point } from "./flow.ts";
import { detailText, timingText, type Segment, type Sequence } from "./sequence.ts";

/** A diagonal stack of screens, each stepping down and right from the last, or a single row. */
export type Arrangement = "stack" | "row";

/** A screen's size as drawn at full size, the shape of the captured page. */
export const SCREEN = { width: 160, height: 100 };
/** The smallest a screen is drawn to fit a figure into a column. */
export const MIN_SCREEN_WIDTH = 64;
/** How far each screen in a stack steps from the last, as a share of a screen. */
const STACK_STEP = 0.62;
const MARGIN = 20;
const LABEL_GAP = 10;
export const LINE_HEIGHT = 15;
const FIRST_BASELINE = 12;
const ROW_GAP = 24;
const ARROW_OFFSET = 18;
const TIME_LABEL = "Time";
const TIME_LABEL_GAP = 6;

export type Emphasis = "title" | "timing" | "detail";

export interface LabelLine {
  text: string;
  emphasis: Emphasis;
}

export interface FigureScreen {
  segment: Segment;
  x: number;
  y: number;
  label: { at: Point; anchor: "start" | "middle"; lines: LabelLine[] };
}

export interface Size {
  width: number;
  height: number;
}

export interface TrialFigure {
  width: number;
  height: number;
  /** How large each screen is drawn. */
  screen: Size;
  screens: FigureScreen[];
  arrow: { from: Point; to: Point };
}

/** What a figure writes beside a screen: its name, how long it lasts, and how it is answered. */
export function labelLines(segment: Segment): LabelLine[] {
  const lines: LabelLine[] = [{ text: segment.title, emphasis: "title" }];
  const timing = timingText(segment);
  if (timing) lines.push({ text: timing, emphasis: "timing" });
  const detail = detailText(segment);
  if (detail) lines.push({ text: detail, emphasis: "detail" });
  return lines;
}

const labelWidth = (lines: LabelLine[]) =>
  Math.max(0, ...lines.map((line) => textWidth(line.text)));

const timeLabelWidth = textWidth(TIME_LABEL) + TIME_LABEL_GAP;

const labelHeight = (lines: LabelLine[]) => (lines.length - 1) * LINE_HEIGHT + FIRST_BASELINE + 4;

function layoutStack(segments: Segment[], screen: Size): TrialFigure {
  const labels = segments.map(labelLines);
  // Each label sits beside its screen above the next one, so a screen steps down at least as far
  // as the tallest label, however small the screens are drawn.
  const step = {
    x: screen.width * STACK_STEP,
    y: Math.max(screen.height * STACK_STEP, ...labels.map(labelHeight)),
  };
  const screens = segments.map((segment, index): FigureScreen => {
    const x = MARGIN + index * step.x;
    const y = MARGIN + index * step.y;
    return {
      segment,
      x,
      y,
      label: {
        at: { x: x + screen.width + LABEL_GAP, y: y + FIRST_BASELINE },
        anchor: "start",
        lines: labels[index],
      },
    };
  });
  // The arrow runs below and left of the screens, parallel to the way they step.
  const reach = Math.max(segments.length - 1, 0) + STACK_STEP;
  const from = { x: MARGIN, y: MARGIN + screen.height + ARROW_OFFSET };
  const to = { x: from.x + reach * step.x, y: from.y + reach * step.y };
  const labelsRight = Math.max(
    0,
    ...screens.map((screen) => screen.label.at.x + labelWidth(screen.label.lines)),
  );
  return {
    width: Math.ceil(Math.max(labelsRight, to.x + timeLabelWidth) + MARGIN),
    height: Math.ceil(to.y + MARGIN),
    screen,
    screens,
    arrow: { from, to },
  };
}

function layoutRow(segments: Segment[], screen: Size): TrialFigure {
  const labels = segments.map(labelLines);
  const column = Math.max(screen.width, ...labels.map(labelWidth));
  const tallest = Math.max(0, ...labels.map((lines) => lines.length));
  const screens = segments.map((segment, index): FigureScreen => {
    const left = MARGIN + index * (column + ROW_GAP);
    return {
      segment,
      x: left + (column - screen.width) / 2,
      y: MARGIN,
      label: {
        at: { x: left + column / 2, y: MARGIN + screen.height + LABEL_GAP + FIRST_BASELINE },
        anchor: "middle",
        lines: labels[index],
      },
    };
  });
  const arrowY = MARGIN + screen.height + LABEL_GAP + tallest * LINE_HEIGHT + ARROW_OFFSET;
  const from = { x: MARGIN, y: arrowY };
  const across = Math.max(segments.length * (column + ROW_GAP) - ROW_GAP, screen.width);
  const to = { x: MARGIN + across, y: arrowY };
  return {
    width: Math.ceil(to.x + timeLabelWidth + MARGIN),
    height: Math.ceil(arrowY + MARGIN),
    screen,
    screens,
    arrow: { from, to },
  };
}

const screenOfWidth = (width: number): Size => ({
  width,
  height: (width * SCREEN.height) / SCREEN.width,
});

/** Where each screen of a block or loop goes, with its label and the time arrow under them all. */
export function layoutTrialFigure(
  sequence: Sequence,
  arrangement: Arrangement,
  screenWidth: number = SCREEN.width,
): TrialFigure {
  const screen = screenOfWidth(screenWidth);
  return arrangement === "stack"
    ? layoutStack(sequence.segments, screen)
    : layoutRow(sequence.segments, screen);
}

/**
 * The figure with the largest screens that let it fit a width, keeping its text the size it is:
 * screens shrink so the labels stay readable. Where the labels, not the screens, set the width,
 * as in a row of short screens with long labels, shrinking further gains nothing; the figure
 * with the largest screens at its narrowest is used, and scaled to the width as a whole.
 */
export function fitTrialFigure(sequence: Sequence, arrangement: Arrangement, maxWidth: number) {
  let narrowest = layoutTrialFigure(sequence, arrangement);
  for (let width = SCREEN.width; width >= MIN_SCREEN_WIDTH; width -= 4) {
    const figure = layoutTrialFigure(sequence, arrangement, width);
    if (figure.width <= maxWidth) return figure;
    if (figure.width < narrowest.width) narrowest = figure;
  }
  return narrowest;
}

const LABEL_STYLE: Record<Emphasis, string> = {
  title: `font-weight="700" fill="${ink("ink")}"`,
  timing: `fill="${ink("ink")}"`,
  detail: `fill="${ink("ink-muted")}"`,
};

/**
 * As much of a screen's name as fits across it, at the 11px it is written in, with room to spare
 * for capitals, which are wider than the average letter the width is reckoned from.
 */
function fitted(text: string, screen: Size) {
  const chars = Math.max(1, Math.floor((screen.width - 16) / ((CHAR_WIDTH * 1.1 * 11) / 12)));
  return text.length <= chars ? text : `${text.slice(0, chars - 1)}…`;
}

function crossSvg(centre: Point, colour: string) {
  const arm = 9;
  return `<path d="M ${centre.x - arm} ${centre.y} H ${centre.x + arm} M ${centre.x} ${centre.y - arm} V ${centre.y + arm}" stroke="${colour}" stroke-width="2.5"/>`;
}

/**
 * What the participant sees on a screen. Until screens are captured from the running experiment,
 * a fixation shows its cross, a pause stays blank, and anything else is named in the middle.
 */
function screenContent(screen: FigureScreen, size: Size, colour: string) {
  const centre = { x: screen.x + size.width / 2, y: screen.y + size.height / 2 };
  const { role, title } = screen.segment;
  if (role === "fixation") return crossSvg(centre, colour);
  if (role === "gap") return "";
  return `<text x="${centre.x}" y="${centre.y + 4}" text-anchor="middle" font-size="11" fill="${colour}" opacity="0.6">${svgText(fitted(title, size))}</text>`;
}

function screenSvg(
  screen: FigureScreen,
  size: Size,
  settings: ExperimentSettings | undefined,
  picture: string | undefined,
) {
  const { x, y } = screen;
  const dash = screen.segment.role === "group" ? ` stroke-dasharray="4 3"` : "";
  const box = `x="${x}" y="${y}" width="${size.width}" height="${size.height}"`;
  const outline = `stroke="${ink("line-strong")}" stroke-width="1.25"${dash}`;
  // A captured screen is the participant's page itself, drawn inside the screen's outline.
  const face = picture
    ? `<rect ${box} fill="${backgroundColor(settings)}"/><image ${box} preserveAspectRatio="xMidYMid meet" xlink:href="${picture}"/><rect ${box} rx="2" fill="none" ${outline}/>`
    : `<rect ${box} rx="2" fill="${backgroundColor(settings)}" ${outline}/>${screenContent(screen, size, textColor(settings))}`;
  const { at, anchor, lines } = screen.label;
  const label = lines
    .map(
      (line, index) =>
        `<tspan x="${at.x}" y="${at.y + index * LINE_HEIGHT}" ${LABEL_STYLE[line.emphasis]}>${svgText(line.text)}</tspan>`,
    )
    .join("");
  return `<g>${face}<text text-anchor="${anchor}">${label}</text></g>`;
}

/** How large a figure is made: as drawn on screen, or to fit one or two columns of a page. */
export type FigureSize = "screen" | "single" | "double";

/** Column widths of a journal page, in millimetres: Nature's, which most journals are close to. */
export const COLUMN_WIDTH_MM = { single: 89, double: 183 };

/**
 * At column size a unit is a quarter of a millimetre, so the 12-unit text prints at 3 mm, about
 * 8.5 pt, above the 8 pt APA asks for at the least, unless the figure is too wide to fit even
 * with its smallest screens and has to be scaled down as a whole.
 */
export const MM_PER_UNIT = 0.25;

/** Print resolution for a PNG made for a page, as journals ask for at the least. */
const PRINT_DPI = 300;
/** A PNG made at screen size is drawn twice over, so it stays sharp on a dense display. */
const SCREEN_PIXEL_RATIO = 2;

/** A block's or loop's trial, screen by screen, as a standalone SVG figure. */
export function trialFigureSvg(
  figure: TrialFigure,
  title: string,
  settings: ExperimentSettings | undefined,
  /** A picture of each screen, by segment, where one was captured. */
  pictures: (string | undefined)[] = [],
  widthMm?: number,
) {
  const { from, to } = figure.arrow;
  const arrow = `<path d="M ${from.x} ${from.y} L ${to.x} ${to.y}" fill="none" stroke="${ink("ink-muted")}" stroke-width="1.25" marker-end="url(#${ARROW_ID})"/>`;
  const time = `<text x="${to.x + TIME_LABEL_GAP}" y="${to.y + 4}" font-style="italic" fill="${ink("ink-muted")}">${TIME_LABEL}</text>`;
  return figureSvg({
    width: figure.width,
    height: figure.height,
    title,
    widthMm,
    body: [
      ...figure.screens.map((screen, index) =>
        screenSvg(screen, figure.screen, settings, pictures[index]),
      ),
      arrow,
      time,
    ],
  });
}

export interface FigureChoices {
  arrangement: Arrangement;
  size: FigureSize;
}

/**
 * The figure of the block or loop a sequence describes, as the timing strip downloads it, with
 * how many pixels wide a PNG of it should be. Made for a column, it keeps its text at print size
 * and shrinks its screens to fit; one that still will not fit is scaled down to the column.
 */
export function sequenceFigure(
  spec: Spec,
  sequence: Sequence,
  { arrangement, size }: FigureChoices,
  pictures: (string | undefined)[] = [],
) {
  const title = `${specFilename(spec)}: one pass through the ${sequence.kind}`;
  if (size === "screen") {
    const figure = layoutTrialFigure(sequence, arrangement);
    return {
      svg: trialFigureSvg(figure, title, spec.settings, pictures),
      pixelWidth: figure.width * SCREEN_PIXEL_RATIO,
    };
  }
  const column = COLUMN_WIDTH_MM[size];
  const figure = fitTrialFigure(sequence, arrangement, column / MM_PER_UNIT);
  const widthMm = Math.min(figure.width * MM_PER_UNIT, column);
  return {
    svg: trialFigureSvg(figure, title, spec.settings, pictures, widthMm),
    pixelWidth: Math.round((widthMm / 25.4) * PRINT_DPI),
  };
}
