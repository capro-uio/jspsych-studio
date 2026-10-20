import { describe, expect, it } from "vitest";
import type { Spec } from "@tachisto/compiler";
import flanker from "../../../examples/flanker.json";
import stroop from "../../../examples/stroop.json";
import { pluginSchema } from "../src/lib/schemas.ts";
import {
  capturePage,
  captureSpec,
  placeCapture,
  readCaptureMessage,
} from "../src/lib/screen-capture.ts";
import { sequenceAt, type Sequence } from "../src/lib/sequence.ts";

const spec = stroop as Spec;
const sequence = sequenceAt(spec, [2, 1], pluginSchema)!;
const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("captureSpec", () => {
  it("runs the block once, in order, for the row asked for, with no pause between steps", () => {
    const { spec: narrowed } = captureSpec(spec, sequence, 1);
    const block = narrowed.timeline.find((node) => node.kind === "block")!;
    expect(block).toMatchObject({ repetitions: 1, randomize_order: false });
    expect(narrowed.conditions?.stroop_trials).toEqual([spec.conditions!.stroop_trials[1]]);
    expect(narrowed.settings?.default_iti).toBe(0);
  });

  it("runs a loop once, since nobody answers to end it", () => {
    const practice = sequenceAt(flanker as Spec, [1, 0, 0], pluginSchema)!;
    const { spec: narrowed } = captureSpec(flanker as Spec, practice);
    const loop = narrowed.timeline.find((node) => node.kind === "loop")!;
    expect(loop).toMatchObject({ repeat_while: { accuracy_below: 0 } });
  });

  it("falls back on the first row for a row the table does not have", () => {
    const { spec: narrowed } = captureSpec(spec, sequence, 99);
    expect(narrowed.conditions?.stroop_trials).toEqual([spec.conditions!.stroop_trials[0]]);
  });

  it("leaves out everything before the block, and never saves data", () => {
    const { spec: narrowed } = captureSpec({ ...spec, data: { save: "download" } }, sequence);
    expect(narrowed.timeline).toHaveLength(1);
    expect(narrowed.data).toBeUndefined();
  });

  it("does not change the study it narrows", () => {
    const before = JSON.stringify(spec);
    captureSpec(spec, sequence, 2);
    expect(JSON.stringify(spec)).toBe(before);
  });
});

describe("capturePage", () => {
  it("carries the picturing library and the hooks that picture each step", async () => {
    const html = await capturePage(spec, sequence);
    expect(html).toContain("htmlToImage");
    expect(html).toContain("window.tachistoCapture(trial.data?.tachisto_step");
    expect(html).toContain('"tachisto-capture"');
  });
});

describe("readCaptureMessage", () => {
  it("reads a picture of a step, and the end of the run", () => {
    expect(readCaptureMessage({ source: "tachisto-capture", step: "2.1", png: PNG })).toEqual({
      done: false,
      step: "2.1",
      png: PNG,
    });
    expect(readCaptureMessage({ source: "tachisto-capture", done: true })).toEqual({ done: true });
  });

  it("refuses a picture that is anything but plain PNG data, since it goes into the figure", () => {
    const hostile = `${PNG}"/><script>alert(1)</script>`;
    expect(
      readCaptureMessage({ source: "tachisto-capture", step: "2.1", png: hostile }),
    ).toBeNull();
    expect(
      readCaptureMessage({
        source: "tachisto-capture",
        step: "2.1",
        png: "data:image/svg+xml,<svg/>",
      }),
    ).toBeNull();
  });

  it("ignores messages from anything else, and steps that are not places in the timeline", () => {
    expect(readCaptureMessage({ source: "tachisto-preview", step: "2.1", png: PNG })).toBeNull();
    expect(readCaptureMessage({ source: "tachisto-capture", step: "2.x", png: PNG })).toBeNull();
    expect(readCaptureMessage("tachisto-capture")).toBeNull();
  });
});

describe("placeCapture", () => {
  const withPause: Sequence = {
    ...sequence,
    segments: [
      sequence.segments[0],
      { ...sequence.segments[0], path: null, role: "gap", title: "Pause" },
      { ...sequence.segments[1], path: [2, 1], role: "group" },
    ],
  };

  it("gives a picture to the segment holding the step, and only the first one it gets", () => {
    const screens: (string | undefined)[] = [undefined, undefined, undefined];
    placeCapture(withPause, screens, "2.1.0", PNG);
    placeCapture(withPause, screens, "2.1.1", "data:image/png;base64,later");
    expect(screens).toEqual([undefined, undefined, PNG]);
  });

  it("never gives one to a pause, or to a step outside the sequence", () => {
    const screens: (string | undefined)[] = [undefined, undefined, undefined];
    placeCapture(withPause, screens, "7", PNG);
    expect(screens).toEqual([undefined, undefined, undefined]);
  });
});
