import { describe, expect, it } from "vitest";
import { idParamOf } from "@jspsych-studio/compiler";
import type { Spec } from "@jspsych-studio/compiler";
import {
  choosePlatform,
  guideFor,
  PLATFORMS,
  setCompletionUrl,
  setIdParam,
} from "../src/lib/recruitment.ts";

const blank = (): Spec => ({ name: "study", timeline: [] });
const PROLIFIC = "https://app.prolific.com/submissions/complete?cc=C1A2B3";

describe("recruiting from a platform", () => {
  it("leaves the id parameter to the platform it names", () => {
    const spec = blank();
    choosePlatform(spec, "prolific");
    expect(spec.recruitment).toEqual({ platform: "prolific" });
    expect(idParamOf(spec.recruitment)).toBe("PROLIFIC_PID");
  });

  it("forgets a parameter typed for the last platform when the platform changes", () => {
    const spec = blank();
    choosePlatform(spec, "custom");
    setIdParam(spec, "workerId");
    choosePlatform(spec, "sona");
    expect(idParamOf(spec.recruitment)).toBe("id");
  });

  it("keeps the return address when the platform changes", () => {
    const spec = blank();
    choosePlatform(spec, "prolific");
    setCompletionUrl(spec, PROLIFIC);
    choosePlatform(spec, "custom");
    expect(spec.recruitment?.endings?.complete?.url).toBe(PROLIFIC);
  });

  it("removes the hand-off when participants open the link directly", () => {
    const spec = blank();
    choosePlatform(spec, "prolific");
    choosePlatform(spec, "none");
    expect(spec.recruitment).toBeUndefined();
  });

  it("stores a parameter only when it differs from the platform's own", () => {
    const spec = blank();
    choosePlatform(spec, "connect");
    setIdParam(spec, " workerId ");
    expect(spec.recruitment?.id_param).toBe("workerId");
    setIdParam(spec, "participantId");
    expect(spec.recruitment?.id_param).toBeUndefined();
    setIdParam(spec, "workerId");
    setIdParam(spec, "  ");
    expect(spec.recruitment?.id_param).toBeUndefined();
  });

  it("drops the ending when its address is cleared", () => {
    const spec = blank();
    choosePlatform(spec, "prolific");
    setCompletionUrl(spec, ` ${PROLIFIC} `);
    expect(spec.recruitment?.endings).toEqual({ complete: { url: PROLIFIC } });
    setCompletionUrl(spec, "");
    expect(spec.recruitment?.endings).toBeUndefined();
  });

  it("leaves a spec without recruitment alone", () => {
    const spec = blank();
    setIdParam(spec, "PROLIFIC_PID");
    setCompletionUrl(spec, PROLIFIC);
    expect(spec.recruitment).toBeUndefined();
  });

  it("guides a spec that names no platform as an unnamed one", () => {
    expect(guideFor(undefined)).toBe(guideFor("custom"));
    for (const platform of PLATFORMS) expect(platform.hint.length).toBeGreaterThan(0);
  });
});
