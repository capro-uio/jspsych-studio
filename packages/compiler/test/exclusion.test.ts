import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { dataColumns } from "../src/metadata.ts";
import type { Spec, TrialNode } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const check = (extra: Partial<TrialNode>, params: TrialNode["params"] = {}): Spec => ({
  name: "screening",
  recruitment: { endings: { screened_out: { message: "<p>Sorry.</p>" } } },
  timeline: [{ kind: "trial", plugin: "browser-check", params, ...extra }],
});

const compiles = (spec: Spec) => () => compileSpec(spec, schemas);

describe("a step that turns participants away", () => {
  it("compiles its plugin so that it ends the trial, not the study", () => {
    const { source } = compileSpec(
      check({ exclusion_ending: "screened_out" }, { minimum_width: 800 }),
      schemas,
    );
    expect(source).toContain("class jsPsychBrowserCheckExcluding extends jsPsychBrowserCheck");
    expect(source).toContain("type: jsPsychBrowserCheckExcluding");
    expect(source).toContain(
      "conditional_function: () => jsPsych.data.getLastTrialData().values()[0]?.excluded === true",
    );
  });

  it.each<TrialNode["params"]>([
    { minimum_width: 800 },
    { minimum_height: 600 },
    { inclusion_function: { code: "() => true" } },
  ])("needs an ending when it can turn people away by %j", (params) => {
    expect(compiles(check({}, params))).toThrow(/needs an ending to send them to/);
  });

  it("needs no ending when it only records", () => {
    expect(compiles(check({}))).not.toThrow();
  });

  it("rejects an ending the study does not have", () => {
    expect(compiles(check({ exclusion_ending: "gone" }, { minimum_width: 800 }))).toThrow(
      /sends excluded participants to "gone", which the study does not have/,
    );
  });

  it("rejects its own exclusion message beside an ending's", () => {
    expect(
      compiles(
        check(
          { exclusion_ending: "screened_out" },
          { minimum_width: 800, exclusion_message: { code: "() => 'no'" } },
        ),
      ),
    ).toThrow(/takes no exclusion_message/);
  });

  it("rejects an ending on a step that turns no one away", () => {
    const spec = check({ exclusion_ending: "screened_out" });
    (spec.timeline[0] as TrialNode).plugin = "html-keyboard-response";
    (spec.timeline[0] as TrialNode).params = { stimulus: "<p>hi</p>" };
    expect(compiles(spec)).toThrow(/turns no one away, so it takes no exclusion_ending/);
  });

  it("describes the excluded column it writes", () => {
    expect(dataColumns(check({ exclusion_ending: "screened_out" }), [])).toEqual(
      expect.arrayContaining(["excluded", "ending"]),
    );
  });
});
