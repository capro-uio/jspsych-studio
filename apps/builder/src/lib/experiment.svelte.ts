import { compileSpec, emitHtml, projectFiles } from "@tachisto/compiler";
import { zipSync, strToU8 } from "fflate";
import { studyFlowFigure } from "./flow-figure.ts";
import { asText, fetchPackageSources } from "./package-sources.ts";
import { exportedSpec } from "./project.svelte.ts";
import { schemas } from "./schemas.ts";

export interface DownloadOptions {
  /** Carry jsPsych and its plugins in the download rather than loading them from unpkg. */
  selfContained: boolean;
}

/** The experiment as a single file, built on demand rather than kept in step with every edit. */
export async function buildExperimentHtml({ selfContained }: DownloadOptions) {
  const spec = exportedSpec();
  const compiled = compileSpec(spec, schemas);
  const inline = selfContained ? asText(await fetchPackageSources(compiled.files)) : undefined;
  const { html } = await emitHtml(compiled, { title: spec.name, inline });
  return html;
}

/**
 * Everything needed to host the experiment, as a zip: page, source, media, project file, readme,
 * the figures that describe it in a paper, and, when self-contained, jsPsych and its plugins.
 */
export async function buildProjectZip({ selfContained }: DownloadOptions) {
  const spec = exportedSpec();
  const packageSources = selfContained
    ? await fetchPackageSources(compileSpec(spec, schemas).files)
    : undefined;
  const files = await projectFiles(spec, schemas, {
    figures: { "flow.svg": studyFlowFigure(spec) },
    packageSources,
  });
  const entries = Object.fromEntries(
    Object.entries(files).map(([path, contents]) => [
      path,
      typeof contents === "string" ? strToU8(contents) : contents,
    ]),
  );
  return zipSync(entries, { level: 6 });
}
