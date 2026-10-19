import { describe, expect, it } from "vitest";
import { isLayout } from "../src/lib/panels.svelte.ts";

describe("remembered panel widths", () => {
  it("accepts a layout the window can show", () => {
    expect(isLayout([18, 32, 50])).toBe(true);
    expect(isLayout([20.5, 29.5, 50])).toBe(true);
  });

  // A stale or hand-edited store must fall back to the defaults, not lay the builder out wrongly.
  it.each([
    ["the wrong number of panels", [50, 50]],
    ["a panel narrower than the minimum", [-40, 100, 40]],
    ["widths that do not fill the row", [20, 20, 20]],
    ["something that is not widths", ["18", 32, 50]],
    ["nothing", null],
  ])("refuses %s", (_case, widths) => {
    expect(isLayout(widths)).toBe(false);
  });
});
