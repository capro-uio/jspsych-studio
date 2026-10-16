import { beforeEach, describe, expect, it } from "vitest";
import { specSchema } from "@jspsych-studio/compiler";
import {
  exportedSpec,
  isUntouched,
  parseSpec,
  project,
  startNewProject,
} from "../src/lib/project.svelte.ts";
import { schemas } from "../src/lib/schemas.ts";

describe("parseSpec", () => {
  it("accepts a well-formed spec", () => {
    const spec = parseSpec(
      JSON.stringify({
        name: "ok",
        timeline: [{ kind: "trial", plugin: "html-keyboard-response" }],
      }),
    );
    expect(spec.name).toBe("ok");
  });

  it("rejects a file with no experiment name", () => {
    expect(() => parseSpec(JSON.stringify({ timeline: [] }))).toThrow(/no experiment name/);
  });

  it("rejects a step of unknown kind", () => {
    expect(() =>
      parseSpec(JSON.stringify({ name: "x", timeline: [{ kind: "sequence" }] })),
    ).toThrow(/unknown kind "sequence"/);
  });

  it("rejects a trial with no plugin", () => {
    expect(() => parseSpec(JSON.stringify({ name: "x", timeline: [{ kind: "trial" }] }))).toThrow(
      /no plugin/,
    );
  });

  it("rejects malformed children deeper in the tree", () => {
    const spec = {
      name: "x",
      timeline: [{ kind: "loop", repeat_while: {}, children: [{ kind: "nope" }] }],
    };
    expect(() => parseSpec(JSON.stringify(spec))).toThrow(/timeline › loop/);
  });
});

describe("isUntouched", () => {
  beforeEach(() => startNewProject());

  it("holds for a fresh project", () => {
    expect(isUntouched()).toBe(true);
  });

  it("stops holding once anything is changed, steps or not", () => {
    project.spec.name = "renamed";
    expect(isUntouched()).toBe(false);
  });
});

describe("exportedSpec", () => {
  // Every top-level field gets copied by name, so a new one that is left out vanishes from
  // downloads, the preview and validation without any error.
  it("keeps every field the spec format has", () => {
    project.spec = {
      name: "complete",
      authors: [{ name: "A. Researcher" }],
      settings: { default_iti: 250 },
      data: { save: "post", experiment_id: "abc" },
      recruitment: { platform: "prolific", id_param: "PROLIFIC_PID" },
      assets: [{ name: "a.png", url: "data:image/png;base64," }],
      conditions: { trials: [{ word: "RED" }] },
      timeline: [{ kind: "trial", plugin: "html-keyboard-response" }],
    };
    const properties = Object.keys(
      (specSchema(schemas.plugins) as { properties: Record<string, unknown> }).properties,
    );
    expect(Object.keys(exportedSpec()).sort()).toEqual(properties.sort());
  });
});
