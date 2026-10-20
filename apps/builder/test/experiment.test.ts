import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { Spec } from "@tachisto/compiler";
import flanker from "../../../examples/flanker.json";
import { buildProjectZip } from "../src/lib/experiment.svelte.ts";
import { studyFlowFigure } from "../src/lib/flow-figure.ts";
import { exportedSpec, loadSpec } from "../src/lib/project.svelte.ts";

describe("buildProjectZip", () => {
  it("carries the study's flow figure beside the experiment", async () => {
    loadSpec(flanker as Spec);
    const files = unzipSync(await buildProjectZip());
    expect(strFromU8(files["figures/flow.svg"])).toBe(studyFlowFigure(exportedSpec()));
    expect(strFromU8(files["README.md"])).toContain("`flow.svg`");
    expect(files["index.html"]).toBeDefined();
  });
});
