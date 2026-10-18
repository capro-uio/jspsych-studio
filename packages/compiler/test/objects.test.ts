import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import type { Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const survey = (questions: unknown[]): Spec => ({
  name: "questionnaire",
  timeline: [{ kind: "trial", plugin: "survey-likert", params: { questions } }],
});

const agreement = ["disagree", "neutral", "agree"];

describe("list parameters whose entries are objects", () => {
  it("compiles a question with its labels", () => {
    const { source } = compileSpec(
      survey([{ prompt: "I enjoyed this", labels: agreement, required: true }]),
      schemas,
    );
    expect(source).toContain('"prompt":"I enjoyed this"');
    expect(source).toContain('"labels":["disagree","neutral","agree"]');
  });

  it("rejects an entry missing a required field", () => {
    expect(() => compileSpec(survey([{ prompt: "no labels here" }]), schemas)).toThrow(
      /entry 1 is missing "labels"/,
    );
  });

  it("rejects a misspelled field inside an entry", () => {
    expect(() =>
      compileSpec(survey([{ prompt: "hi", labels: agreement, requird: true }]), schemas),
    ).toThrow(/entry 1 has no field "requird"/);
  });

  it("names the offending entry when several are present", () => {
    expect(() =>
      compileSpec(survey([{ prompt: "fine", labels: agreement }, { prompt: "broken" }]), schemas),
    ).toThrow(/entry 2 is missing "labels"/);
  });

  it("rejects a bare value where a set of fields belongs", () => {
    expect(() => compileSpec(survey(["just a string"]), schemas)).toThrow(
      /entry 1 should be a set of fields/,
    );
  });
});

describe.each(["survey-multi-choice", "survey-multi-select"])("%s questions", (plugin) => {
  const choices = (questions: unknown[]): Spec => ({
    name: "questionnaire",
    timeline: [{ kind: "trial", plugin, params: { questions } }],
  });

  it("compiles a question with its options", () => {
    const { source } = compileSpec(choices([{ prompt: "Pick", options: ["a", "b"] }]), schemas);
    expect(source).toContain('"options":["a","b"]');
  });

  it("rejects a question with no options", () => {
    expect(() => compileSpec(choices([{ prompt: "Pick" }]), schemas)).toThrow(
      /entry 1 is missing "options"/,
    );
  });
});
