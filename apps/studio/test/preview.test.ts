import { describe, expect, it } from "vitest";
import { previewSpec } from "../src/lib/preview.ts";
import type { Spec } from "@jspsych-studio/compiler";

const trial = (stimulus: string, tag?: string) => ({
  kind: "trial" as const,
  plugin: "html-keyboard-response",
  ...(tag ? { tag } : {}),
  params: { stimulus },
});

const spec: Spec = {
  name: "study",
  data: { save: "post", experiment_id: "real" },
  conditions: { rows: [{ word: "RED" }] },
  timeline: [
    trial("<p>welcome</p>"),
    {
      kind: "loop",
      repeat_while: { scope: "practice", accuracy_below: 0.75 },
      children: [
        {
          kind: "block",
          conditions: "rows",
          children: [trial("<p>fixation</p>"), trial("<p>practice</p>", "practice")],
        },
      ],
    },
    {
      kind: "assign",
      method: "random",
      groups: [
        { name: "wide", children: [trial("<p>wide</p>")] },
        { name: "narrow", children: [trial("<p>narrow</p>")] },
      ],
    },
  ],
};

describe("what the preview runs", () => {
  it("never saves data, however the experiment is set up", () => {
    expect(previewSpec(spec).data).toBeUndefined();
    expect(previewSpec(spec, { from: [0] }).data).toBeUndefined();
  });

  it("runs the whole experiment when no step is chosen", () => {
    expect(previewSpec(spec).timeline).toHaveLength(3);
  });

  it("keeps the containers a step needs around it", () => {
    const { timeline } = previewSpec(spec, { from: [1, 0, 1] });
    expect(timeline).toHaveLength(1);
    const loop = timeline[0] as { kind: string; children: { kind: string; children: unknown[] }[] };
    expect(loop.kind).toBe("loop");
    // The block stays, so the step still has its conditions; its neighbour does not.
    expect(loop.children[0].kind).toBe("block");
    expect(loop.children[0].children).toHaveLength(1);
    expect(loop.children[0].children[0]).toMatchObject({ params: { stimulus: "<p>practice</p>" } });
  });

  it("unwraps a split so the chosen path is what runs", () => {
    const { timeline } = previewSpec(spec, { from: [2, 1, 0] });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ params: { stimulus: "<p>narrow</p>" } });
  });

  it("runs a single top-level step on its own", () => {
    expect(previewSpec(spec, { from: [0] }).timeline).toEqual([trial("<p>welcome</p>")]);
  });

  it("gives back nothing when the step is gone", () => {
    expect(previewSpec(spec, { from: [9] }).timeline).toEqual([]);
  });
});
