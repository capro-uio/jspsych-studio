import type { ParameterSchema } from "@jspsych-studio/schemas";

export type Grid = unknown[][];

/** What a new place in a grid holds: a square, or a key to be filled in. */
export function blankCell(cell: ParameterSchema) {
  return cell.type === "integer" ? 1 : "";
}

/** Whether a grid's places are squares that are there or not, rather than keys. */
export function isSquares(cell: ParameterSchema) {
  return cell.jspsychType === "BOOL";
}

function width(grid: Grid) {
  return Math.max(1, ...grid.map((row) => row.length));
}

/** A grid of one place, for a grid with nothing in it yet. */
export function singleCell(cell: ParameterSchema): Grid {
  return [[blankCell(cell)]];
}

export function addRow(grid: Grid, cell: ParameterSchema): Grid {
  return [...grid, Array.from({ length: width(grid) }, () => blankCell(cell))];
}

export function addColumn(grid: Grid, cell: ParameterSchema): Grid {
  if (grid.length === 0) return singleCell(cell);
  return grid.map((row) => [...row, blankCell(cell)]);
}

// A grid keeps one row and one column, since a plugin given none draws nothing to respond to.
export function removeRow(grid: Grid): Grid {
  return grid.length > 1 ? grid.slice(0, -1) : grid;
}

export function removeColumn(grid: Grid): Grid {
  return grid.every((row) => row.length > 1) ? grid.map((row) => row.slice(0, -1)) : grid;
}

export function setCell(grid: Grid, row: number, column: number, value: unknown): Grid {
  return grid.map((cells, index) =>
    index === row
      ? cells.map((existing, position) => (position === column ? value : existing))
      : cells,
  );
}
