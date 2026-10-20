// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Spec } from "@tachisto/compiler";
import flanker from "../../../examples/flanker.json";
import stroop from "../../../examples/stroop.json";
import { FLOW_HUES, flowFigureSvg } from "../src/lib/flow-figure.ts";
import { layoutFlow } from "../src/lib/flow.ts";

const figureOf = (spec: Spec, title = "study flow") => flowFigureSvg(layoutFlow(spec), title);

function parse(svg: string) {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(document.querySelector("parsererror")).toBeNull();
  return document.documentElement;
}

describe("flowFigureSvg", () => {
  it("draws one shape and one text for every box the diagram lays out", () => {
    const layout = layoutFlow(flanker as Spec);
    const root = parse(flowFigureSvg(layout, "flanker"));
    const boxes = [...root.children].filter((child) => child.tagName === "g").slice(0, -1);
    expect(boxes).toHaveLength(layout.boxes.length);
    for (const box of boxes) expect(box.querySelectorAll("rect, path")).toHaveLength(1);
    const text = root.textContent ?? "";
    for (const box of layout.boxes) {
      for (const line of [...box.title, ...box.details]) expect(text).toContain(line);
    }
  });

  it("is the size the diagram is, on white", () => {
    const layout = layoutFlow(stroop as Spec);
    const root = parse(flowFigureSvg(layout, "stroop"));
    expect(root.getAttribute("viewBox")).toBe(`0 0 ${layout.width} ${layout.height}`);
    expect(root.querySelector(":scope > rect")?.getAttribute("fill")).toBe("#ffffff");
  });

  it("needs no stylesheet, so other programs draw it as the builder does", () => {
    const svg = figureOf(stroop as Spec);
    expect(svg).not.toMatch(/var\(|class=|<style/);
    expect(parse(svg).getAttribute("font-family")).toContain("sans-serif");
  });

  it("dashes the repeat edge of a loop in the loop's hue and keeps its arrowheads", () => {
    const root = parse(figureOf(flanker as Spec));
    const dashed = root.querySelectorAll(`path[stroke="${FLOW_HUES.loop}"][stroke-dasharray]`);
    expect(dashed).toHaveLength(1);
    expect(root.querySelectorAll('path[marker-end="url(#arrow)"]').length).toBeGreaterThan(0);
    expect(root.querySelector("marker#arrow")).not.toBeNull();
  });

  it("tints a block in its hue, mixed into white the way app.css mixes it", () => {
    const root = parse(figureOf(flanker as Spec));
    const block = root.querySelector(`rect[stroke="${FLOW_HUES.block}"]`);
    expect(block?.getAttribute("fill")).toBe("#eef2f6");
  });

  it("escapes text that would otherwise break the file", () => {
    const spec = {
      name: "test",
      conditions: {},
      timeline: [{ kind: "trial", plugin: "html-keyboard-response", tag: 'a & <b> "c"' }],
    } as Spec;
    const root = parse(figureOf(spec, "Q&A <pilot>"));
    expect(root.querySelector("title")?.textContent).toBe("Q&A <pilot>");
  });
});

describe("FLOW_HUES", () => {
  const css = readFileSync(join(import.meta.dirname, "..", "src", "app.css"), "utf8");

  it.each(Object.entries(FLOW_HUES))(
    "%s is the light ink app.css gives the diagram",
    (kind, hex) => {
      expect(css).toContain(`--flow-${kind}-stroke: light-dark(${hex},`);
      expect(css).toContain(
        `--flow-${kind}-fill: color-mix(in srgb, var(--flow-${kind}-stroke) 9%,`,
      );
    },
  );
});
