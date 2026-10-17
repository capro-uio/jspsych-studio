import { describe, expect, it } from "vitest";
import { compileSpec } from "@jspsych-studio/compiler";
import type { Spec } from "@jspsych-studio/compiler";
import { previewSpec } from "../src/lib/preview.ts";
import { schemas } from "../src/lib/schemas.ts";

const trial = (stimulus: string, tag?: string) => ({
  kind: "trial" as const,
  plugin: "html-keyboard-response",
  ...(tag ? { tag } : {}),
  params: { stimulus },
});

const spec: Spec = {
  name: "study",
  data: { save: "post", experiment_id: "real" },
  recruitment: {
    id_param: "PROLIFIC_PID",
    endings: { complete: { url: "https://app.prolific.com/submissions/complete?cc=C1" } },
  },
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

  // Redirecting needs uploaded data, so a preview that kept the hand-off would not even compile.
  it("never sends anyone back to a recruitment platform", () => {
    expect(previewSpec(spec).recruitment).toEqual({
      endings: {
        complete: {
          message:
            "<p>Here the participant is sent to https://app.prolific.com/submissions/complete?cc=C1</p>",
        },
      },
    });
    expect(() => compileSpec(previewSpec(spec), schemas)).not.toThrow();
  });

  it("keeps the endings an end step reaches, so the step still runs", () => {
    const ending: Spec = {
      ...spec,
      recruitment: {
        platform: "prolific",
        endings: {
          no_consent: { url: "https://app.prolific.com/x?cc=NO&a=<b>" },
          screened_out: { message: "<p>Thanks anyway.</p>" },
        },
      },
      timeline: [trial("<p>consent</p>", "consent"), { kind: "end", ending: "no_consent" }],
    };
    const previewed = previewSpec(ending);
    expect(previewed.recruitment?.endings?.no_consent.message).toContain("cc=NO&amp;a=&lt;b&gt;");
    expect(previewed.recruitment?.endings?.screened_out).toEqual({
      message: "<p>Thanks anyway.</p>",
    });
    expect(previewed.recruitment).not.toHaveProperty("platform");
    expect(() => compileSpec(previewed, schemas)).not.toThrow();
  });

  it("leaves out recruitment when the study has no endings", () => {
    const direct: Spec = { ...spec, recruitment: { platform: "sona" } };
    expect(previewSpec(direct)).not.toHaveProperty("recruitment");
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

  // The service counts participants, so a preview asking it would skew the real balance; and the
  // preview saves no data, so a counted draw would not even compile.
  it("draws counted groups and orders in the browser, leaving the experiment as it was", () => {
    const counted: Spec = {
      name: "counted",
      data: { save: "post", experiment_id: "real" },
      timeline: [
        {
          kind: "counterbalance",
          method: "latin_square",
          tasks: [
            {
              name: "first",
              children: [
                {
                  kind: "assign",
                  method: "balanced",
                  groups: [
                    { name: "a", children: [trial("<p>a</p>")] },
                    { name: "b", children: [trial("<p>b</p>")] },
                  ],
                },
              ],
            },
            { name: "second", children: [trial("<p>second</p>")] },
          ],
        },
      ],
    };
    const { timeline } = previewSpec(counted);
    expect(timeline[0]).toMatchObject({
      method: "random",
      tasks: [{ children: [{ method: "random" }] }, {}],
    });
    expect(counted.timeline[0]).toMatchObject({ method: "latin_square" });
    expect(() => compileSpec(previewSpec(counted), schemas)).not.toThrow();
    const { source } = compileSpec(previewSpec(counted), schemas);
    expect(source).not.toContain("/api/condition/");
  });

  it("unwraps a counterbalance so only the chosen task runs", () => {
    const ordered: Spec = {
      name: "ordered",
      timeline: [
        {
          kind: "counterbalance",
          method: "latin_square",
          tasks: [
            { name: "flanker", children: [trial("<p>flanker</p>")] },
            { name: "stroop", children: [trial("<p>stroop</p>")] },
          ],
        },
      ],
    };
    const preview = previewSpec(ordered, { from: [0, 1, 0] });
    expect(preview.timeline).toEqual([trial("<p>stroop</p>")]);
    expect(() => compileSpec(preview, schemas)).not.toThrow();
  });

  it("runs a single top-level step on its own", () => {
    expect(previewSpec(spec, { from: [0] }).timeline).toEqual([trial("<p>welcome</p>")]);
  });

  it("gives back nothing when the step is gone", () => {
    expect(previewSpec(spec, { from: [9] }).timeline).toEqual([]);
  });
});
