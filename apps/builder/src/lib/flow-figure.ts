import tokens from "@tachisto/brand/tokens.json" with { type: "json" };
import { escapeHtmlText, type Spec } from "@tachisto/compiler";
import { specFilename } from "./files.ts";
import {
  centred,
  cornerRadius,
  decisionOutline,
  edgePath,
  layoutFlow,
  lineY,
  textX,
  type FlowBox,
  type FlowLayout,
} from "./flow.ts";

const LIGHT_INKS = new Map(tokens.color.tokens.map((token) => [token.name, token.value.light]));

function ink(name: string) {
  const colour = LIGHT_INKS.get(name);
  if (!colour) throw new Error(`no brand colour named ${name}`);
  return colour;
}

const FONT = "'Atkinson Hyperlegible', Arial, Helvetica, sans-serif";

/** The tint app.css mixes each flow hue into raised paper with, so the figure needs no CSS. */
export const FLOW_TINT = 0.09;

function tint(hex: string) {
  const paper = ink("paper-raised");
  const channel = (colour: string, at: number) => parseInt(colour.slice(at, at + 2), 16);
  const mixed = [1, 3, 5].map((at) =>
    Math.round(channel(hex, at) * FLOW_TINT + channel(paper, at) * (1 - FLOW_TINT)),
  );
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

interface Outline {
  fill: string;
  stroke: string;
  dash?: string;
}

const hue = (stroke: string): Outline => ({ fill: tint(stroke), stroke });

const SHAPE_OUTLINES: Partial<Record<FlowBox["shape"], Outline>> = {
  frame: { fill: ink("paper-sunk"), stroke: ink("line-strong") },
  decision: hue(ink("caution")),
  marker: hue(ink("signal")),
  lane: { fill: ink("paper"), stroke: ink("caution"), dash: "3 3" },
  empty: { fill: "none", stroke: ink("line"), dash: "4 3" },
  terminal: { fill: ink("paper"), stroke: ink("ink") },
};

const KIND_OUTLINES: Record<string, Outline> = {
  block: hue(ink("flow-block")),
  loop: hue(ink("flow-loop")),
};

const STEP_OUTLINE: Outline = { fill: ink("paper-raised"), stroke: ink("line-strong") };

function outlineOf(box: FlowBox): Outline {
  return KIND_OUTLINES[box.kind] ?? SHAPE_OUTLINES[box.shape] ?? STEP_OUTLINE;
}

function boxSvg(box: FlowBox) {
  const { fill, stroke, dash } = outlineOf(box);
  const paint = `fill="${fill}" stroke="${stroke}" stroke-width="1.25"${dash ? ` stroke-dasharray="${dash}"` : ""}`;
  const shape =
    box.shape === "decision"
      ? `<path d="${decisionOutline(box)}" ${paint}/>`
      : `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${cornerRadius(box)}" ${paint}/>`;
  const empty = box.shape === "empty";
  const lines = [
    ...box.title.map((line) => ({
      line,
      weight: "600",
      colour: empty ? ink("ink-muted") : ink("ink"),
    })),
    ...box.details.map((line) => ({ line, weight: "400", colour: ink("ink-muted") })),
  ];
  const text = lines
    .map(
      ({ line, weight, colour }, index) =>
        `<tspan x="${textX(box)}" y="${lineY(box, index)}" font-weight="${weight}" fill="${colour}">${escapeHtmlText(line)}</tspan>`,
    )
    .join("");
  const anchor = centred(box) ? "middle" : "start";
  const style = empty ? ` font-style="italic"` : "";
  return `<g>${shape}<text text-anchor="${anchor}"${style}>${text}</text></g>`;
}

/**
 * The flow as a standalone SVG for a paper or a poster: every colour and font is written on the
 * element it paints, so it opens the same in a browser, Inkscape, Illustrator or a journal's
 * system, and stays in the light inks whatever theme the builder is in.
 */
export function flowFigureSvg(layout: FlowLayout, title: string) {
  const edges = layout.edges
    .map((edge) => {
      const stroke = edge.repeat ? ink("flow-loop") : ink("ink-muted");
      const dash = edge.repeat ? ` stroke-dasharray="5 3"` : "";
      const arrow = edge.arrow ? ` marker-end="url(#arrow)"` : "";
      const path = `<path d="${edgePath(edge)}" fill="none" stroke="${stroke}" stroke-width="1.25"${dash}${arrow}/>`;
      const label =
        edge.label && edge.labelAt
          ? `<text x="${edge.labelAt.x}" y="${edge.labelAt.y}" text-anchor="middle" font-size="11" font-weight="600" fill="${ink("flow-loop")}">${escapeHtmlText(edge.label)}</text>`
          : "";
      return path + label;
    })
    .join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" font-family="${FONT}" font-size="12" role="img">`,
    `<title>${escapeHtmlText(title)}</title>`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${ink("ink-muted")}"/></marker></defs>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    ...layout.boxes.map(boxSvg),
    `<g>${edges}</g>`,
    `</svg>`,
  ].join("\n");
}

/** A study's flow as the figure the flow view downloads and the project zip carries. */
export function studyFlowFigure(spec: Spec, layout = layoutFlow(spec)) {
  return flowFigureSvg(layout, `${specFilename(spec)}: study flow`);
}
