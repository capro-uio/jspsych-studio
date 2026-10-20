import { backgroundColor, textColor, type ExperimentSettings, type Spec } from "@tachisto/compiler";
import { ARROW_ID, CHAR_WIDTH, figureSvg, ink, svgText, textWidth } from "./figure.ts";
import { specFilename } from "./files.ts";
import type { Point } from "./flow.ts";
import { detailText, timingText, type Segment, type Sequence } from "./sequence.ts";

/** A diagonal stack of screens, each stepping down and right from the last, or a single row. */
export type Arrangement = "stack" | "row";

export const SCREEN = { width: 160, height: 100 };
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

export interface TrialFigure {
  width: number;
  height: number;
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

function layoutStack(segments: Segment[]): TrialFigure {
  const step = { x: SCREEN.width * STACK_STEP, y: SCREEN.height * STACK_STEP };
  const screens = segments.map((segment, index): FigureScreen => {
    const x = MARGIN + index * step.x;
    const y = MARGIN + index * step.y;
    return {
      segment,
      x,
      y,
      label: {
        at: { x: x + SCREEN.width + LABEL_GAP, y: y + FIRST_BASELINE },
        anchor: "start",
        lines: labelLines(segment),
      },
    };
  });
  // The arrow runs below and left of the screens, parallel to the way they step.
  const reach = Math.max(segments.length - 1, 0) + STACK_STEP;
  const from = { x: MARGIN, y: MARGIN + SCREEN.height + ARROW_OFFSET };
  const to = { x: from.x + reach * step.x, y: from.y + reach * step.y };
  const labelsRight = Math.max(
    0,
    ...screens.map((screen) => screen.label.at.x + labelWidth(screen.label.lines)),
  );
  return {
    width: Math.ceil(Math.max(labelsRight, to.x + timeLabelWidth) + MARGIN),
    height: Math.ceil(to.y + MARGIN),
    screens,
    arrow: { from, to },
  };
}

function layoutRow(segments: Segment[]): TrialFigure {
  const labels = segments.map(labelLines);
  const column = Math.max(SCREEN.width, ...labels.map(labelWidth));
  const tallest = Math.max(0, ...labels.map((lines) => lines.length));
  const screens = segments.map((segment, index): FigureScreen => {
    const left = MARGIN + index * (column + ROW_GAP);
    return {
      segment,
      x: left + (column - SCREEN.width) / 2,
      y: MARGIN,
      label: {
        at: { x: left + column / 2, y: MARGIN + SCREEN.height + LABEL_GAP + FIRST_BASELINE },
        anchor: "middle",
        lines: labels[index],
      },
    };
  });
  const arrowY = MARGIN + SCREEN.height + LABEL_GAP + tallest * LINE_HEIGHT + ARROW_OFFSET;
  const from = { x: MARGIN, y: arrowY };
  const across = Math.max(segments.length * (column + ROW_GAP) - ROW_GAP, SCREEN.width);
  const to = { x: MARGIN + across, y: arrowY };
  return {
    width: Math.ceil(to.x + timeLabelWidth + MARGIN),
    height: Math.ceil(arrowY + MARGIN),
    screens,
    arrow: { from, to },
  };
}

/** Where each screen of a block or loop goes, with its label and the time arrow under them all. */
export function layoutTrialFigure(sequence: Sequence, arrangement: Arrangement): TrialFigure {
  return arrangement === "stack" ? layoutStack(sequence.segments) : layoutRow(sequence.segments);
}

const LABEL_STYLE: Record<Emphasis, string> = {
  title: `font-weight="700" fill="${ink("ink")}"`,
  timing: `fill="${ink("ink")}"`,
  detail: `fill="${ink("ink-muted")}"`,
};

/** As many characters of a screen's name as fit across it. */
const SCREEN_CHARS = Math.floor((SCREEN.width - 16) / CHAR_WIDTH);

const fitted = (text: string) =>
  text.length <= SCREEN_CHARS ? text : `${text.slice(0, SCREEN_CHARS - 1)}…`;

function crossSvg(centre: Point, colour: string) {
  const arm = 9;
  return `<path d="M ${centre.x - arm} ${centre.y} H ${centre.x + arm} M ${centre.x} ${centre.y - arm} V ${centre.y + arm}" stroke="${colour}" stroke-width="2.5"/>`;
}

/**
 * What the participant sees on a screen. Until screens are captured from the running experiment,
 * a fixation shows its cross, a pause stays blank, and anything else is named in the middle.
 */
function screenContent(screen: FigureScreen, colour: string) {
  const centre = { x: screen.x + SCREEN.width / 2, y: screen.y + SCREEN.height / 2 };
  const { role, title } = screen.segment;
  if (role === "fixation") return crossSvg(centre, colour);
  if (role === "gap") return "";
  return `<text x="${centre.x}" y="${centre.y + 4}" text-anchor="middle" font-size="11" fill="${colour}" opacity="0.6">${svgText(fitted(title))}</text>`;
}

function screenSvg(screen: FigureScreen, settings: ExperimentSettings | undefined) {
  const dash = screen.segment.role === "group" ? ` stroke-dasharray="4 3"` : "";
  const frame = `<rect x="${screen.x}" y="${screen.y}" width="${SCREEN.width}" height="${SCREEN.height}" rx="2" fill="${backgroundColor(settings)}" stroke="${ink("line-strong")}" stroke-width="1.25"${dash}/>`;
  const { at, anchor, lines } = screen.label;
  const label = lines
    .map(
      (line, index) =>
        `<tspan x="${at.x}" y="${at.y + index * LINE_HEIGHT}" ${LABEL_STYLE[line.emphasis]}>${svgText(line.text)}</tspan>`,
    )
    .join("");
  return `<g>${frame}${screenContent(screen, textColor(settings))}<text text-anchor="${anchor}">${label}</text></g>`;
}

/** A block's or loop's trial, screen by screen, as a standalone SVG figure. */
export function trialFigureSvg(
  figure: TrialFigure,
  title: string,
  settings: ExperimentSettings | undefined,
) {
  const { from, to } = figure.arrow;
  const arrow = `<path d="M ${from.x} ${from.y} L ${to.x} ${to.y}" fill="none" stroke="${ink("ink-muted")}" stroke-width="1.25" marker-end="url(#${ARROW_ID})"/>`;
  const time = `<text x="${to.x + TIME_LABEL_GAP}" y="${to.y + 4}" font-style="italic" fill="${ink("ink-muted")}">${TIME_LABEL}</text>`;
  return figureSvg({
    width: figure.width,
    height: figure.height,
    title,
    body: [...figure.screens.map((screen) => screenSvg(screen, settings)), arrow, time],
  });
}

/** The figure of the block or loop a sequence describes, as the timing strip downloads it. */
export function sequenceFigure(spec: Spec, sequence: Sequence, arrangement: Arrangement) {
  const title = `${specFilename(spec)}: one pass through the ${sequence.kind}`;
  return trialFigureSvg(layoutTrialFigure(sequence, arrangement), title, spec.settings);
}
