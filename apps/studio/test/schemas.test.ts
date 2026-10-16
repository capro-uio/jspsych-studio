import { describe, expect, it } from "vitest";
import { schemas, startingParams, switchVariant, visibleFields } from "../src/lib/schemas.ts";

const canvasObject = schemas.plugins.psychophysics.properties.stimuli.items!;
const shown = (value: Record<string, unknown>) =>
  visibleFields(canvasObject, value).map(([name]) => name);

describe("startingParams", () => {
  it("starts a canvas step from the schema's example", () => {
    expect(startingParams("psychophysics")).toEqual({
      stimuli: [{ obj_type: "cross", line_length: 40 }],
    });
  });

  it("gives each new step its own copy of the example", () => {
    const first = startingParams("psychophysics").stimuli as { line_length: number }[];
    first[0].line_length = 99;
    expect(startingParams("psychophysics").stimuli).toEqual([
      { obj_type: "cross", line_length: 40 },
    ]);
  });

  it("still fills required text with a placeholder", () => {
    expect(startingParams("html-keyboard-response")).toEqual({
      stimulus: "<p>Your text here</p>",
    });
  });
});

describe("visibleFields", () => {
  it("shows a circle only what a circle reads, plus placement", () => {
    expect(shown({ obj_type: "circle" })).toEqual(
      expect.arrayContaining(["obj_type", "startX", "startY", "radius", "fill_color"]),
    );
    expect(shown({ obj_type: "circle" })).not.toContain("content");
    expect(shown({ obj_type: "circle" })).not.toContain("tilt");
  });

  it("keeps a field that holds a value, so it can still be cleared", () => {
    expect(shown({ obj_type: "circle", content: "left over" })).toContain("content");
  });

  it("shows every field of an entry without variants", () => {
    const question = schemas.plugins["survey-likert"].properties.questions.items!;
    expect(visibleFields(question, {}).length).toBe(Object.keys(question.properties!).length);
  });
});

describe("switchVariant", () => {
  it("drops what only the old shape read and keeps the placement", () => {
    expect(
      switchVariant(
        canvasObject.variants!,
        { obj_type: "cross", line_length: 40, startX: -100 },
        "circle",
      ),
    ).toEqual({ obj_type: "circle", startX: -100 });
  });

  it("keeps a field both shapes read", () => {
    expect(
      switchVariant(
        canvasObject.variants!,
        { obj_type: "circle", radius: 5, fill_color: "red" },
        "rect",
      ),
    ).toEqual({ obj_type: "rect", fill_color: "red" });
  });
});
