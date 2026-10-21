// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const fresh = async () => {
  vi.resetModules();
  return import("../src/lib/figure-choices.svelte.ts");
};

describe("figure choices", () => {
  beforeEach(() => localStorage.clear());

  it("start stacked, as drawn, as SVG, with no block's conditions chosen", async () => {
    const { figureChoices, blockChoice } = await fresh();
    expect(figureChoices).toMatchObject({ arrangement: "stack", size: "screen", format: "svg" });
    expect(blockChoice([2])).toEqual({ byColumn: "", row: 0 });
  });

  it("remember the layout, size and format the next time the builder opens", async () => {
    const first = await fresh();
    Object.assign(first.figureChoices, { arrangement: "row", size: "single", format: "png" });
    first.rememberFigureChoices();
    const { figureChoices } = await fresh();
    expect(figureChoices).toMatchObject({ arrangement: "row", size: "single", format: "png" });
  });

  it("ignore what they do not know in what was remembered", async () => {
    localStorage.setItem("tachisto:figures", JSON.stringify({ size: "huge", format: "gif" }));
    const { figureChoices } = await fresh();
    expect(figureChoices).toMatchObject({ size: "screen", format: "svg" });
  });

  it("keep each block's own choice apart", async () => {
    const { blockChoice, setBlockChoice } = await fresh();
    setBlockChoice([2], { byColumn: "congruency" });
    setBlockChoice([1, 0], { row: 3 });
    expect(blockChoice([2])).toEqual({ byColumn: "congruency", row: 0 });
    expect(blockChoice([1, 0])).toEqual({ byColumn: "", row: 3 });
  });

  it("are still made when the browser will not remember them", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { figureChoices, rememberFigureChoices } = await fresh();
    expect(figureChoices.format).toBe("svg");
    expect(() => rememberFigureChoices()).not.toThrow();
    vi.restoreAllMocks();
  });
});
