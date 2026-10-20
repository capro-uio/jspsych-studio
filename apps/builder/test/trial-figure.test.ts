// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Spec } from "@tachisto/compiler";
import stroop from "../../../examples/stroop.json";
import { pluginSchema } from "../src/lib/schemas.ts";
import { sequenceAt, type Segment, type Sequence } from "../src/lib/sequence.ts";
import {
  labelLines,
  layoutTrialFigure,
  SCREEN,
  sequenceFigure,
  trialFigureSvg,
  type TrialFigure,
} from "../src/lib/trial-figure.ts";

const segment = (role: Segment["role"], title: string, extra: Partial<Segment> = {}): Segment => ({
  path: [0],
  role,
  title,
  timing: { kind: "fixed", ms: { min: 500, max: 500 } },
  weight: 500,
  ...extra,
});

const sequenceOf = (...segments: Segment[]): Sequence => ({ path: [0], kind: "block", segments });

const trial = sequenceOf(
  segment("fixation", "Fixation"),
  segment("gap", "Pause", { path: null, timing: { kind: "fixed", ms: { min: 200, max: 400 } } }),
  segment("stimulus", "Target", {
    timing: { kind: "limit", ms: { min: 2000, max: 2000 } },
    answer: "f or j",
    shownFor: { min: 100, max: 100 },
  }),
);

function parse(svg: string) {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(document.querySelector("parsererror")).toBeNull();
  return document.documentElement;
}

const labelHeight = 3 * 15;

function inside(figure: TrialFigure) {
  return figure.screens.every(
    (screen) =>
      screen.x >= 0 &&
      screen.y >= 0 &&
      screen.x + SCREEN.width <= figure.width &&
      screen.y + SCREEN.height <= figure.height,
  );
}

describe("labelLines", () => {
  it("names the step, says how long it lasts and how it is answered", () => {
    expect(labelLines(trial.segments[2])).toEqual([
      { text: "Target", emphasis: "title" },
      { text: "up to 2000 ms", emphasis: "timing" },
      { text: "shown 100 ms · f or j", emphasis: "detail" },
    ]);
  });

  it("writes a jittered pause as its range, and leaves out a detail it does not have", () => {
    expect(labelLines(trial.segments[1])).toEqual([
      { text: "Pause", emphasis: "title" },
      { text: "200–400 ms", emphasis: "timing" },
    ]);
  });
});

describe("layoutTrialFigure", () => {
  it("steps each stacked screen down and right of the last by the same amount", () => {
    const { screens } = layoutTrialFigure(trial, "stack");
    const steps = screens.slice(1).map((screen, index) => ({
      x: screen.x - screens[index].x,
      y: screen.y - screens[index].y,
    }));
    expect(new Set(steps.map((step) => `${step.x},${step.y}`)).size).toBe(1);
    expect(steps[0].x).toBeGreaterThan(0);
    expect(steps[0].y).toBeGreaterThan(0);
    expect(steps[0].x).toBeLessThan(SCREEN.width);
  });

  it("writes a stacked screen's label to its right, clear of the screen that follows", () => {
    const { screens } = layoutTrialFigure(trial, "stack");
    for (const [index, screen] of screens.slice(0, -1).entries()) {
      expect(screen.label.at.x).toBeGreaterThan(screen.x + SCREEN.width);
      expect(screen.label.at.y + labelHeight).toBeLessThanOrEqual(screens[index + 1].y);
    }
  });

  it("runs the stack's time arrow down and right, below every screen", () => {
    const { arrow, screens } = layoutTrialFigure(trial, "stack");
    expect(arrow.to.x).toBeGreaterThan(arrow.from.x);
    expect(arrow.to.y).toBeGreaterThan(arrow.from.y);
    expect(arrow.from.y).toBeGreaterThan(screens[0].y + SCREEN.height);
  });

  it("lines a row's screens up side by side without overlap, labelled beneath", () => {
    const { screens } = layoutTrialFigure(trial, "row");
    expect(new Set(screens.map((screen) => screen.y)).size).toBe(1);
    for (const [index, screen] of screens.slice(1).entries()) {
      expect(screen.x).toBeGreaterThan(screens[index].x + SCREEN.width);
    }
    for (const screen of screens) {
      expect(screen.label.anchor).toBe("middle");
      expect(screen.label.at.x).toBeCloseTo(screen.x + SCREEN.width / 2);
      expect(screen.label.at.y).toBeGreaterThan(screen.y + SCREEN.height);
    }
  });

  it("runs a row's time arrow level, under the labels, across every screen", () => {
    const { arrow, screens } = layoutTrialFigure(trial, "row");
    expect(arrow.from.y).toBe(arrow.to.y);
    expect(arrow.from.y).toBeGreaterThan(screens[0].label.at.y + 2 * 15);
    expect(arrow.to.x).toBeGreaterThanOrEqual(screens.at(-1)!.x + SCREEN.width);
  });

  it.each(["stack", "row"] as const)("fits every %s screen and label inside the figure", (way) => {
    const figure = layoutTrialFigure(trial, way);
    expect(inside(figure)).toBe(true);
    expect(figure.arrow.to.x).toBeLessThan(figure.width);
    expect(figure.arrow.to.y).toBeLessThan(figure.height);
  });

  it("widens a row's columns to fit a label longer than a screen", () => {
    const long = sequenceOf(segment("screen", "A".repeat(60)), segment("screen", "B"));
    const [first, second] = layoutTrialFigure(long, "row").screens;
    expect(second.label.at.x - first.label.at.x).toBeGreaterThan(60 * 6.6);
  });
});

describe("trialFigureSvg", () => {
  const svgOf = (settings?: Spec["settings"]) =>
    parse(trialFigureSvg(layoutTrialFigure(trial, "stack"), "a & b", settings));

  it("draws one screen per step, on the experiment's own background", () => {
    const root = svgOf({ background_color: "#808080" });
    const frames = root.querySelectorAll(`rect[width="${SCREEN.width}"]`);
    expect(frames).toHaveLength(3);
    for (const frame of frames) expect(frame.getAttribute("fill")).toBe("#808080");
  });

  it("draws a fixation's cross, leaves a pause blank, and names any other screen", () => {
    const groups = [...svgOf().querySelectorAll(":scope > g")];
    expect(groups[0].querySelector("path")).not.toBeNull();
    expect(groups[1].querySelector("path")).toBeNull();
    expect(groups[1].querySelectorAll(":scope > text")).toHaveLength(1);
    expect(groups[2].textContent).toContain("Target");
  });

  it("carries every label and an arrow marked as time", () => {
    const root = svgOf();
    const text = root.textContent ?? "";
    for (const line of ["Fixation", "500 ms", "200–400 ms", "up to 2000 ms", "f or j", "Time"]) {
      expect(text).toContain(line);
    }
    expect(root.querySelector('path[marker-end="url(#arrow)"]')).not.toBeNull();
    expect(root.querySelector("title")?.textContent).toBe("a & b");
  });

  it("needs no stylesheet", () => {
    expect(trialFigureSvg(layoutTrialFigure(trial, "row"), "t", undefined)).not.toMatch(
      /var\(|class=|<style/,
    );
  });
});

describe("sequenceFigure", () => {
  it("draws an example's block from the timing strip, named after the study", () => {
    const spec = stroop as Spec;
    const sequence = sequenceAt(spec, [2, 1], pluginSchema)!;
    const root = parse(sequenceFigure(spec, sequence, "row"));
    expect(root.querySelector("title")?.textContent).toMatch(/one pass through the block$/);
    expect(root.textContent).toContain("300 ms");
    expect(root.textContent).toContain("r or b");
  });
});
