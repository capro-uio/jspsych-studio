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
import { containerName, containerPaths, sequenceAt, type Sequence } from "./sequence.ts";
import { sequenceFigure } from "./trial-figure.ts";

export interface DownloadOptions {
  /** Carry jsPsych and its plugins in the download rather than loading them from unpkg. */
  selfContained: boolean;
}

export interface ProjectDownloadOptions extends DownloadOptions, StudyFigureOptions {}

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
 * Picturing every block's screens shares one deadline, so a study with many blocks, or one whose
 * jsPsych cannot be reached, cannot hold up its download for long.
 */
const FIGURES_DEADLINE = 60_000;

export interface FigureProgress {
  done: number;
  total: number;
}

export interface StudyFigureOptions {
  /** How each block's screens are pictured; the hidden capture frame by default. */
  capture?: typeof captureScreens;
  onProgress?: (progress: FigureProgress) => void;
}

const fileSafe = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "steps";

/**
 * The figures that describe a study in a paper: its flow, and each block and loop as screens, as
 * the participant sees them for its first row, named after the block's conditions or the loop.
 * Each figure stands alone: one whose screens cannot be pictured is drawn with plain screens, and
 * one that cannot be drawn is left out rather than costing the rest.
 */
export async function studyFigures(spec: Spec, { capture, onProgress }: StudyFigureOptions = {}) {
  const figures: Record<string, string> = { "flow.svg": studyFlowFigure(spec) };
  const sequences = containerPaths(spec.timeline)
    .map((path) => sequenceAt(spec, path, pluginSchema))
    .filter((sequence): sequence is Sequence => sequence !== null && sequence.segments.length > 0);
  let pictureScreens: typeof captureScreens | null =
    capture ??
    (await import("./screen-capture.ts").then(
      (module) => module.captureScreens,
      () => null,
    ));
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), FIGURES_DEADLINE);
  try {
    for (const [index, sequence] of sequences.entries()) {
      onProgress?.({ done: index, total: sequences.length });
      let pictures: (string | undefined)[] = [];
      if (pictureScreens && !deadline.signal.aborted) {
        pictures = await pictureScreens(spec, sequence, { signal: deadline.signal }).catch(
          () => [],
        );
        // Not one screen pictured means the study could not run, as when jsPsych cannot be
        // reached; the blocks after it would only wait as long, so they are drawn plain.
        if (!pictures.some(Boolean)) pictureScreens = null;
      }
      try {
        const base = `${sequence.kind}-${fileSafe(containerName(spec, sequence.path))}`;
        const name = `${base}.svg` in figures ? `${base}-${sequence.path.join("-")}` : base;
        figures[`${name}.svg`] = sequenceFigure(
          spec,
          sequence,
          { arrangement: "stack", size: "screen" },
          pictures,
        ).svg;
      } catch {
        // A figure that cannot be drawn is left out; the download is worth more than it.
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return figures;
}

/**
 * Everything needed to host the experiment, as a zip: page, source, media, project file, readme,
 * the figures that describe it in a paper, and, when self-contained, jsPsych and its plugins.
 */
export async function buildProjectZip({ selfContained, ...figureOptions }: ProjectDownloadOptions) {
  // A plain copy, not the builder's live state: picturing the screens copies the study into a
  // run of its own, which live state cannot be.
  const spec = $state.snapshot(exportedSpec());
  const files = await projectFiles(spec, schemas, {
    figures: await studyFigures(spec, figureOptions),
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
