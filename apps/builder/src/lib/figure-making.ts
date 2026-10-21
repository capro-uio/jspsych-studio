import type { Spec } from "@tachisto/compiler";
import type { captureScreens } from "./screen-capture.ts";
import { conditionColumns, containerName, segmentInputs, type Sequence } from "./sequence.ts";
import { sequenceFigure, varyingScreens, type FigureChoices } from "./trial-figure.ts";

/** What a block's figure shows of its conditions: a column to show side by side, or one row. */
export interface BlockChoice {
  /** The column whose conditions are shown side by side, or "" for none. */
  byColumn: string;
  /** The row pictured when no column is chosen. */
  row: number;
}

export const NO_CONDITIONS: BlockChoice = { byColumn: "", row: 0 };

export interface MadeFigure {
  svg: string;
  /** How many pixels wide a PNG of it should be. */
  pixelWidth: number;
  /** What the figure could not show that was asked of it, if anything. */
  note: string;
}

export interface MakingOptions {
  /** How the screens are pictured; without one, they are drawn plain. */
  capture?: typeof captureScreens;
  signal?: AbortSignal;
  /** Told which condition is being pictured, when there are several. */
  onProgress?: (message: string) => void;
}

const fileSafe = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "steps";

/** A figure's file name, without its extension: what it is and what it is called. */
export const figureName = (spec: Spec, sequence: Sequence) =>
  `${sequence.kind}-${fileSafe(containerName(spec, sequence.path))}`;

/**
 * A block's or loop's figure as chosen: pictured for the row asked, or once for each condition of
 * the column asked, with the screens that differ between them shown side by side. A choice the
 * block no longer has, such as a column since removed, is set aside. A screen that cannot be
 * pictured is drawn plain.
 */
export async function makeFigure(
  spec: Spec,
  sequence: Sequence,
  choices: FigureChoices,
  block: BlockChoice,
  { capture, signal, onProgress }: MakingOptions = {},
): Promise<MadeFigure> {
  const condition = conditionColumns(spec, sequence.path).find(
    (each) => each.column === block.byColumn,
  );
  const runs = condition ? condition.values : [{ value: "", row: block.row }];
  const pictured: (string | undefined)[][] = [];
  for (const [index, run] of runs.entries()) {
    if (condition) onProgress?.(`Picturing ${run.value}, ${index + 1} of ${runs.length}…`);
    const pictures = capture
      ? await capture(spec, sequence, { row: run.row, signal }).catch(() => [])
      : [];
    pictured.push(pictures);
    if (signal?.aborted) break;
  }
  const conditions = runs.map((run, index) => ({
    label: run.value,
    pictures: pictured[index] ?? [],
    inputs: segmentInputs(spec, sequence, run.row),
  }));
  let note = "";
  if (condition) {
    const varying = varyingScreens(sequence, conditions);
    const shown = varying.filter((index) =>
      conditions.every((each) => each.pictures[index] !== undefined),
    );
    if (varying.length === 0) {
      note = `No screen differs between the values of ${condition.column}.`;
    } else if (shown.length < varying.length) {
      note = "Some screens that differ could not be pictured, so they are left out.";
    }
  }
  const { svg, pixelWidth } = sequenceFigure(
    spec,
    sequence,
    choices,
    conditions[0].pictures,
    condition && { column: condition.column, conditions },
  );
  return { svg, pixelWidth, note };
}
