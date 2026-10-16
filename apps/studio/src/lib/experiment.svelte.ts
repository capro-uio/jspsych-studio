import { compileSpec, emitHtml, projectFiles } from "@jspsych-studio/compiler";
import { zipSync, strToU8 } from "fflate";
import { exportedSpec } from "./project.svelte.ts";
import { schemas } from "./schemas.ts";

/** The experiment as a single file, built on demand rather than kept in step with every edit. */
export async function buildExperimentHtml() {
  const spec = exportedSpec();
  const { html } = await emitHtml(compileSpec(spec, schemas), { title: spec.name });
  return html;
}

/** Everything needed to host the experiment, as a zip: page, source, media, project file, readme. */
export async function buildProjectZip() {
  const spec = exportedSpec();
  const files = await projectFiles(spec, schemas);
  const entries = Object.fromEntries(
    Object.entries(files).map(([path, contents]) => [
      path,
      typeof contents === "string" ? strToU8(contents) : contents,
    ]),
  );
  return zipSync(entries, { level: 6 });
}
