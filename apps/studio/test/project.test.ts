import { beforeEach, describe, expect, it } from "vitest";
import { isUntouched, parseSpec, project, startNewProject } from "../src/lib/project.svelte.ts";

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
