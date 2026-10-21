import { NO_CONDITIONS, type BlockChoice } from "./figure-making.ts";
import { readStored, writeStored } from "./storage.ts";
import type { Arrangement, FigureSize } from "./trial-figure.ts";

export type FigureFormat = "svg" | "png";

export interface FigureChoicesState {
  arrangement: Arrangement;
  size: FigureSize;
  format: FigureFormat;
  /** Each block's own choices, by its path, as "2" or "1.0". */
  blocks: Record<string, BlockChoice>;
}

const STORAGE_KEY = "figures";

const ARRANGEMENTS: Arrangement[] = ["stack", "row"];
const SIZES: FigureSize[] = ["screen", "single", "double"];
const FORMATS: FigureFormat[] = ["svg", "png"];

function stored(): Pick<FigureChoicesState, "arrangement" | "size" | "format"> {
  const fallback = {
    arrangement: "stack" as const,
    size: "screen" as const,
    format: "svg" as const,
  };
  try {
    const saved = JSON.parse(readStored(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    return {
      arrangement: ARRANGEMENTS.find((each) => each === saved.arrangement) ?? fallback.arrangement,
      size: SIZES.find((each) => each === saved.size) ?? fallback.size,
      format: FORMATS.find((each) => each === saved.format) ?? fallback.format,
    };
  } catch {
    // Blocked or garbled storage is no reason to refuse to draw a figure.
    return fallback;
  }
}

/**
 * How figures are made, as chosen in the Figures view: the layout, size and format every figure
 * shares, which the browser remembers, and each block's own choice of conditions, kept for the
 * session. The project download makes its figures the same way.
 */
export const figureChoices = $state<FigureChoicesState>({ ...stored(), blocks: {} });

export function rememberFigureChoices() {
  const { arrangement, size, format } = figureChoices;
  try {
    writeStored(STORAGE_KEY, JSON.stringify({ arrangement, size, format }));
  } catch {
    // Not remembering the choice is better than failing to make it.
  }
}

export const blockKey = (path: number[]) => path.join(".");

export function blockChoice(path: number[]): BlockChoice {
  return figureChoices.blocks[blockKey(path)] ?? NO_CONDITIONS;
}

export function setBlockChoice(path: number[], choice: Partial<BlockChoice>) {
  figureChoices.blocks[blockKey(path)] = { ...blockChoice(path), ...choice };
}
