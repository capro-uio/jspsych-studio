import { describe, expect, it } from "vitest";
import { recordsOf } from "./csv.ts";

describe("recordsOf", () => {
  it("reads a quoted field holding commas, doubled quotes and a line break", () => {
    const csv = '"rt","gaze"\r\n"512","[{""x"":1,""y"":2}]"\r\n"9","a\nb"\r\n';
    expect(recordsOf(csv)).toEqual([
      { rt: "512", gaze: '[{"x":1,"y":2}]' },
      { rt: "9", gaze: "a\nb" },
    ]);
  });

  it("keeps an empty last field", () => {
    expect(recordsOf('"a","b"\n"1",""')).toEqual([{ a: "1", b: "" }]);
  });
});
