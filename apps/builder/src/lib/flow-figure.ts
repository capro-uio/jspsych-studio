import { escapeHtmlText, type Spec } from "@tachisto/compiler";
import { ARROW_ID, figureSvg, ink } from "./figure.ts";
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

/** The flow as a standalone SVG figure. */
export function flowFigureSvg(layout: FlowLayout, title: string) {
  const edges = layout.edges
    .map((edge) => {
      const stroke = edge.repeat ? ink("flow-loop") : ink("ink-muted");
      const dash = edge.repeat ? ` stroke-dasharray="5 3"` : "";
      const arrow = edge.arrow ? ` marker-end="url(#${ARROW_ID})"` : "";
      const path = `<path d="${edgePath(edge)}" fill="none" stroke="${stroke}" stroke-width="1.25"${dash}${arrow}/>`;
      const label =
        edge.label && edge.labelAt
          ? `<text x="${edge.labelAt.x}" y="${edge.labelAt.y}" text-anchor="middle" font-size="11" font-weight="600" fill="${ink("flow-loop")}">${escapeHtmlText(edge.label)}</text>`
          : "";
      return path + label;
    })
    .join("");
  return figureSvg({
    width: layout.width,
    height: layout.height,
    title,
    body: [...layout.boxes.map(boxSvg), `<g>${edges}</g>`],
  });
}

/** A study's flow as the figure the flow view downloads and the project zip carries. */
export function studyFlowFigure(spec: Spec, layout = layoutFlow(spec)) {
  return flowFigureSvg(layout, `${specFilename(spec)}: study flow`);
}
