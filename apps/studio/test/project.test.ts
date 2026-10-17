import { beforeEach, describe, expect, it } from "vitest";
import { compileSpec, specSchema } from "@jspsych-studio/compiler";
import {
  exportedSpec,
  isUntouched,
  newCounterbalance,
  newEnd,
  newTrial,
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

  // A file the builder saved has to open again, whatever kinds of step it holds.
  it("accepts every kind of step the builder can make", () => {
    const step = { kind: "trial", plugin: "html-keyboard-response" };
    const timeline = [
      { kind: "block", conditions: "rows", children: [step] },
      { kind: "loop", repeat_while: { scope: "x" }, children: [step] },
      { kind: "assign", method: "random", groups: [{ name: "a", children: [step] }] },
      { kind: "counterbalance", method: "random", tasks: [{ name: "a", children: [step] }] },
      { kind: "branch", when: { scope: "x" }, then: [step] },
      { kind: "checkpoint", name: "here" },
      { kind: "end", ending: "ended_early" },
    ];
    expect(parseSpec(JSON.stringify({ name: "x", timeline })).timeline).toHaveLength(7);
  });

  it("rejects malformed steps inside a counterbalanced task, naming the task", () => {
    const spec = {
      name: "x",
      timeline: [
        { kind: "counterbalance", method: "random", tasks: [{ name: "stroop", children: [{}] }] },
      ],
    };
    expect(() => parseSpec(JSON.stringify(spec))).toThrow(/timeline › counterbalance › stroop/);
  });

  it("rejects a counterbalance with no tasks to order", () => {
    const spec = { name: "x", timeline: [{ kind: "counterbalance", method: "random" }] };
    expect(() => parseSpec(JSON.stringify(spec))).toThrow(/counterbalance holds no list of paths/);
  });
});

describe("newCounterbalance", () => {
  it("arrives with two named tasks, each ready to run", () => {
    const step = (stimulus: string) => newTrial("html-keyboard-response", { stimulus });
    const node = newCounterbalance(step("a"), step("b"));
    expect(node.method).toBe("random");
    expect(node.tasks.map((task) => task.name)).toEqual(["task 1", "task 2"]);
    expect(() => compileSpec({ name: "x", timeline: [node] }, schemas)).not.toThrow();
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

describe("newEnd", () => {
  beforeEach(() => startNewProject());

  it("reaches an ending the study already has", () => {
    project.spec.recruitment = { endings: { no_consent: { message: "<p>bye</p>" } } };
    expect(newEnd()).toEqual({ kind: "end", ending: "no_consent" });
  });

  it("adds an ending to reach when there is none, so the step is ready to run", () => {
    expect(newEnd()).toEqual({ kind: "end", ending: "ended_early" });
    expect(project.spec.recruitment?.endings?.ended_early?.message).toMatch(/Thank you/);
  });
});
