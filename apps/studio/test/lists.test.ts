import { describe, expect, it } from "vitest";
import { unique } from "../src/lib/lists.ts";

describe("unique", () => {
  it("keeps each item once, in the order first seen", () => {
    expect(unique(["practice", "test", "practice"])).toEqual(["practice", "test"]);
    expect(unique([])).toEqual([]);
  });
});
