import { describe, expect, it } from "vitest";
import { asText } from "../src/lib/text.ts";

describe("asText", () => {
  it("shows text and numbers as they are, and nothing as empty", () => {
    expect(asText("RED")).toBe("RED");
    expect(asText(250)).toBe("250");
    expect(asText(false)).toBe("false");
    expect(asText(undefined)).toBe("");
    expect(asText(null)).toBe("");
  });

  // A cell or parameter holding a structure would otherwise read, and save back, "[object Object]".
  it("shows lists and objects as JSON", () => {
    expect(asText({ x: 1 })).toBe('{"x":1}');
    expect(asText(["f", "j"])).toBe('["f","j"]');
  });
});
