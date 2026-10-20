import {
  assertFitsInOnePage,
  compileSpec,
  emitHtml,
  projectFiles,
  type Spec,
} from "@tachisto/compiler";
import { zipSync, strToU8 } from "fflate";
import { studyFlowFigure } from "./flow-figure.ts";
import { asText, fetchPackageSources } from "./package-sources.ts";
import { exportedSpec } from "./project.svelte.ts";
import { pluginSchema, schemas } from "./schemas.ts";
import type { captureScreens } from "./screen-capture.ts";
import { containerPaths, sequenceAt } from "./sequence.ts";
import { sequenceFigure } from "./trial-figure.ts";

export interface DownloadOptions {
  /** Carry jsPsych and its plugins in the download rather than loading them from unpkg. */
  selfContained: boolean;
}

export interface ProjectDownloadOptions extends DownloadOptions {
  /** How each block's screens are pictured for its figure; the hidden capture frame by default. */
  capture?: typeof captureScreens;
}

/** The experiment as a single file, built on demand rather than kept in step with every edit. */
export async function buildExperimentHtml({ selfContained }: DownloadOptions) {
  const spec = exportedSpec();
  const compiled = compileSpec(spec, schemas);
  if (selfContained) assertFitsInOnePage(compiled);
  const inline = selfContained ? asText(await fetchPackageSources(compiled.files)) : undefined;
  const { html } = await emitHtml(compiled, { title: spec.name, inline });
  return html;
}

/**
 * The figures that describe a study in a paper: its flow, and each block and loop as screens, as
 * the participant sees them for its first row. A block whose screens cannot be pictured is still
 * drawn, with plain screens.
 */
export async function studyFigures(spec: Spec, capture?: typeof captureScreens) {
  const pictureScreens = capture ?? (await import("./screen-capture.ts")).captureScreens;
  const figures: Record<string, string> = { "flow.svg": studyFlowFigure(spec) };
  for (const path of containerPaths(spec.timeline)) {
    const sequence = sequenceAt(spec, path, pluginSchema);
    if (!sequence || sequence.segments.length === 0) continue;
    const pictures = await pictureScreens(spec, sequence).catch(() => []);
    const { svg } = sequenceFigure(
      spec,
      sequence,
      { arrangement: "stack", size: "screen" },
      pictures,
    );
    figures[`${sequence.kind}-${path.join("-")}.svg`] = svg;
  }
  return figures;
}

/**
 * Everything needed to host the experiment, as a zip: page, source, media, project file, readme,
 * the figures that describe it in a paper, and, when self-contained, jsPsych and its plugins.
 */
export async function buildProjectZip({ selfContained, capture }: ProjectDownloadOptions) {
  // A plain copy, not the builder's live state: picturing the screens copies the study into a
  // run of its own, which live state cannot be.
  const spec = $state.snapshot(exportedSpec());
  const files = await projectFiles(spec, schemas, {
    figures: await studyFigures(spec, capture),
    packageSources: selfContained ? (needed) => fetchPackageSources(needed) : undefined,
  });
  const entries = Object.fromEntries(
    Object.entries(files).map(([path, contents]) => [
      path,
      typeof contents === "string" ? strToU8(contents) : contents,
    ]),
  );
  return zipSync(entries, { level: 6 });
}
