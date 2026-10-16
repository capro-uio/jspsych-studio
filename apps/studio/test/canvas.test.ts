import { describe, expect, it } from "vitest";
import {
  extent as extentWith,
  fromStage,
  geometry,
  imageSize,
  lockedAxes,
  nudge,
  pinned,
  placeAt,
  samePlacement,
  SNAP_DISTANCE,
  stageFor,
  toStage,
} from "../src/lib/canvas.ts";

const extent = (object: Record<string, unknown>) => extentWith(object, geometry(object));

const stage = stageFor({ canvas_width: 400, canvas_height: 300 });

describe("stageFor", () => {
  it("uses the step's canvas size and background when it sets them", () => {
    expect(stageFor({ canvas_width: 400, canvas_height: 300, background_color: "white" })).toEqual({
      width: 400,
      height: 300,
      background: "white",
      sized: true,
    });
  });

  it("stands in for the participant's window when the size is left to it", () => {
    expect(stageFor({ canvas_width: 400 })).toEqual({
      width: 800,
      height: 600,
      background: "grey",
      sized: false,
    });
  });

  it("does not take a size from a column as fixed", () => {
    expect(stageFor({ canvas_width: { var: "w" }, canvas_height: 300 }).sized).toBe(false);
  });
});

describe("toStage and fromStage", () => {
  it("measures from the centre by default", () => {
    expect(toStage({ startX: -50, startY: 20 }, stage)).toEqual({ x: 150, y: 170 });
    expect(toStage({}, stage)).toEqual({ x: 200, y: 150 });
  });

  it("measures from the top left when the object turns the centre origin off", () => {
    expect(toStage({ startX: 10, startY: 20, origin_center: false }, stage)).toEqual({
      x: 10,
      y: 20,
    });
  });

  it("round-trips to whole pixels", () => {
    expect(fromStage({ x: 150.4, y: 170.6 }, {}, stage)).toEqual({ x: -50, y: 21 });
    expect(fromStage({ x: 10.2, y: 20 }, { origin_center: false }, stage)).toEqual({
      x: 10,
      y: 20,
    });
  });
});

describe("placeAt", () => {
  it("writes the new centre in the object's own coordinates", () => {
    const { object, snapped } = placeAt(
      { obj_type: "circle", radius: 5 },
      { x: 300, y: 50 },
      stage,
      { snap: true },
    );
    expect(object).toEqual({ obj_type: "circle", radius: 5, startX: 100, startY: -100 });
    expect(snapped).toEqual({ vertical: false, horizontal: false });
  });

  it("snaps onto a centre line that is close enough", () => {
    const { object, snapped } = placeAt(
      {},
      { x: 200 + SNAP_DISTANCE, y: 150 - SNAP_DISTANCE - 1 },
      stage,
      { snap: true },
    );
    expect(object).toEqual({ startX: 0, startY: -SNAP_DISTANCE - 1 });
    expect(snapped).toEqual({ vertical: true, horizontal: false });
  });

  it("places freely when snapping is off", () => {
    expect(placeAt({}, { x: 203, y: 151 }, stage, { snap: false }).object).toEqual({
      startX: 3,
      startY: 1,
    });
  });

  it("leaves a coordinate taken from a column alone", () => {
    const { object, snapped } = placeAt({ startX: { var: "x" } }, { x: 200, y: 50 }, stage, {
      snap: true,
    });
    expect(object).toEqual({ startX: { var: "x" }, startY: -100 });
    expect(snapped.vertical).toBe(false);
  });
});

describe("nudge", () => {
  it("moves from the default position when none is set", () => {
    expect(nudge({ obj_type: "cross" }, 1, 0)).toEqual({ obj_type: "cross", startX: 1 });
  });

  it("does not move along an axis taken from a column", () => {
    expect(nudge({ startX: 5, startY: { var: "y" } }, 10, 10)).toEqual({
      startX: 15,
      startY: { var: "y" },
    });
  });
});

describe("lockedAxes and pinned", () => {
  it("reports which coordinates come from a column", () => {
    expect(lockedAxes({ startX: 3, startY: { var: "y" } })).toEqual({ x: false, y: true });
    expect(pinned({ startX: 3, startY: { var: "y" } })).toBe(false);
    expect(pinned({ startX: { var: "x" }, startY: { var: "y" } })).toBe(true);
  });
});

describe("samePlacement", () => {
  const at = (x: number, vertical = false) => placeAt({}, { x, y: 0 }, stage, { snap: vertical });

  it("treats a move within the same pixel as no move", () => {
    expect(samePlacement(at(10.2), at(10.4))).toBe(true);
    expect(samePlacement(at(10), at(11))).toBe(false);
    expect(samePlacement(null, at(10))).toBe(false);
  });

  it("notices a snap turning on", () => {
    expect(samePlacement(at(200, false), at(200, true))).toBe(false);
  });
});

describe("imageSize", () => {
  const natural = { width: 200, height: 100 };

  it("draws at the file's own size unless told otherwise", () => {
    expect(imageSize({}, natural)).toEqual(natural);
  });

  it("follows scale, width or height, keeping the shape", () => {
    expect(imageSize({ scale: 0.5 }, natural)).toEqual({ width: 100, height: 50 });
    expect(imageSize({ image_width: 50 }, natural)).toEqual({ width: 50, height: 25 });
    expect(imageSize({ image_height: 50 }, natural)).toEqual({ width: 100, height: 50 });
  });
});

describe("extent", () => {
  it("covers each shape around its centre", () => {
    expect(extent({ obj_type: "circle", radius: 10 })).toEqual({ width: 21, height: 21 });
    expect(extent({ obj_type: "rect", width: 30, height: 10, line_width: 2 })).toEqual({
      width: 32,
      height: 12,
    });
    expect(extent({ obj_type: "cross", line_length: 40 })).toEqual({ width: 41, height: 41 });
  });

  it("follows a line's angle", () => {
    const vertical = extent({ obj_type: "line", line_length: 100, angle: 90 });
    expect(vertical.width).toBeCloseTo(1);
    expect(vertical.height).toBeCloseTo(101);
  });

  it("grows text with its lines", () => {
    const one = extent({ obj_type: "text", content: "abc" });
    const two = extent({ obj_type: "text", content: "abc\ndef" });
    expect(two.width).toBe(one.width);
    expect(two.height).toBeGreaterThan(one.height);
  });

  it("stands in for a size it cannot know, so the object can still be picked up", () => {
    expect(extent({ obj_type: "circle", radius: { var: "r" } })).toEqual({ width: 41, height: 41 });
    expect(extent({ obj_type: "image", file: "a.png" })).toEqual({ width: 40, height: 40 });
    expect(extentWith({ obj_type: "image" }, geometry({}), { width: 10, height: 8 })).toEqual({
      width: 10,
      height: 8,
    });
    expect(extent({})).toEqual({ width: 40, height: 40 });
  });
});
