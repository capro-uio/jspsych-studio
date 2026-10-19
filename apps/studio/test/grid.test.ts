import { describe, expect, it } from "vitest";
import type { ParameterSchema } from "@jspsych-studio/schemas";
import {
  addColumn,
  addRow,
  blankCell,
  isSquares,
  removeColumn,
  removeRow,
  setCell,
} from "../src/lib/grid.ts";

const square = { title: "cell", type: "integer", jspsychType: "BOOL" } as ParameterSchema;
const key = { title: "cell", type: "string", jspsychType: "KEYS" } as ParameterSchema;

describe("grids", () => {
  it("tells squares from keys, and starts a new place as a square or an empty key", () => {
    expect([isSquares(square), isSquares(key)]).toEqual([true, false]);
    expect([blankCell(square), blankCell(key)]).toEqual([1, ""]);
  });

  it("adds a row as wide as the grid, and a column to every row", () => {
    expect(addRow([[1, 0, 1]], square)).toEqual([
      [1, 0, 1],
      [1, 1, 1],
    ]);
    expect(addColumn([["a"], ["b"]], key)).toEqual([
      ["a", ""],
      ["b", ""],
    ]);
  });

  it("removes the last row or column, but keeps one of each", () => {
    expect(removeRow([[1], [0]])).toEqual([[1]]);
    expect(removeRow([[1]])).toEqual([[1]]);
    expect(
      removeColumn([
        [1, 0],
        [0, 1],
      ]),
    ).toEqual([[1], [0]]);
    expect(removeColumn([[1], [0]])).toEqual([[1], [0]]);
  });

  it("changes one place and leaves the rest", () => {
    const grid = [
      [1, 1],
      [1, 1],
    ];
    expect(setCell(grid, 1, 0, 0)).toEqual([
      [1, 1],
      [0, 1],
    ]);
    expect(grid).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });
});
