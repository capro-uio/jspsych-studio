import { describe, expect, it, vi } from "vitest";
import type { Spec } from "@tachisto/compiler";
import stroop from "../../../examples/stroop.json";
import { figureName, makeFigure, NO_CONDITIONS } from "../src/lib/figure-making.ts";
import { pluginSchema } from "../src/lib/schemas.ts";
import { sequenceAt } from "../src/lib/sequence.ts";

const spec = stroop as Spec;
const sequence = sequenceAt(spec, [2, 1], pluginSchema)!;
const choices = { arrangement: "stack" as const, size: "screen" as const };
const png = (row: number) => `data:image/png;base64,${btoa(`row${row}`)}`;
const capture = vi.fn((_spec: Spec, _sequence: unknown, options?: { row?: number }) =>
  Promise.resolve([png(-1), png(options?.row ?? 0)]),
);

describe("makeFigure", () => {
  it("pictures the row chosen", async () => {
    capture.mockClear();
    const made = await makeFigure(spec, sequence, choices, { byColumn: "", row: 2 }, { capture });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][2]).toMatchObject({ row: 2 });
    expect(made.svg).toContain(png(2));
    expect(made.note).toBe("");
  });

  it("pictures each condition of the column chosen, and shows the screen that differs", async () => {
    capture.mockClear();
    const progress: string[] = [];
    const made = await makeFigure(
      spec,
      sequence,
      choices,
      { byColumn: "congruency", row: 0 },
      { capture, onProgress: (message) => progress.push(message) },
    );
    expect(capture).toHaveBeenCalledTimes(2);
    expect(made.svg).toContain("Conditions by congruency");
    expect(progress).toEqual(["Picturing congruent, 1 of 2…", "Picturing incongruent, 2 of 2…"]);
  });

  it("says when the screens that differ could not be pictured", async () => {
    const nothing = () => Promise.resolve([] as (string | undefined)[]);
    const made = await makeFigure(
      spec,
      sequence,
      choices,
      { byColumn: "congruency", row: 0 },
      {
        capture: nothing,
      },
    );
    expect(made.note).toMatch(/could not be pictured/);
    expect(made.svg).not.toContain("Conditions by");
  });

  it("draws plain screens without a way to picture them, and sets aside a column it lacks", async () => {
    const made = await makeFigure(spec, sequence, choices, { byColumn: "gone", row: 0 });
    expect(made.svg).not.toContain("<image");
    expect(made.note).toBe("");
    expect((await makeFigure(spec, sequence, choices, NO_CONDITIONS)).svg).toBe(made.svg);
  });
});

describe("figureName", () => {
  it("names a figure for what it is and what it runs, safe for a file", () => {
    expect(figureName(spec, sequence)).toBe("block-stroop_trials");
    const odd = {
      ...spec,
      conditions: { "Main Trials!": [] },
      timeline: [{ ...spec.timeline[2], conditions: "Main Trials!" }],
    } as Spec;
    expect(figureName(odd, { ...sequence, path: [0] })).toBe("block-main-trials");
  });
});
