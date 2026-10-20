import { strFromU8, unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Spec } from "@tachisto/compiler";
import flanker from "../../../examples/flanker.json";
import { buildExperimentHtml, buildProjectZip } from "../src/lib/experiment.svelte.ts";
import { studyFlowFigure } from "../src/lib/flow-figure.ts";
import { exportedSpec, loadSpec } from "../src/lib/project.svelte.ts";
import { installedFetch } from "./installed.ts";

describe("buildProjectZip", () => {
  it("carries the study's flow figure beside the experiment", async () => {
    loadSpec(flanker as Spec);
    const files = unzipSync(await buildProjectZip({ selfContained: false }));
    expect(strFromU8(files["figures/flow.svg"])).toBe(studyFlowFigure(exportedSpec()));
    expect(strFromU8(files["README.md"])).toContain("`flow.svg`");
    expect(files["index.html"]).toBeDefined();
  });
});

describe("a self-contained download", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("carries checked copies of jsPsych and its plugins under lib/, loading nothing from unpkg", async () => {
    vi.stubGlobal("fetch", installedFetch);
    loadSpec(flanker as Spec);
    const files = unzipSync(await buildProjectZip({ selfContained: true }));
    expect(files["lib/jspsych/dist/index.browser.min.js"]).toBeDefined();
    expect(
      files["lib/@jspsych/plugin-html-keyboard-response/dist/index.browser.min.js"],
    ).toBeDefined();
    expect(strFromU8(files["index.html"])).not.toContain("unpkg.com");
  });

  it("writes jsPsych and its plugins into a single page", async () => {
    vi.stubGlobal("fetch", installedFetch);
    loadSpec(flanker as Spec);
    const html = await buildExperimentHtml({ selfContained: true });
    expect(html).not.toMatch(/\bsrc="|<link /);
    expect(html).toContain(".jspsych-display-element");
  });

  it("loads from unpkg, checked, when it is not self-contained", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    loadSpec(flanker as Spec);
    const html = await buildExperimentHtml({ selfContained: false });
    expect(html).toContain('src="https://unpkg.com/jspsych@');
    expect(html).toContain('integrity="sha384-');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
