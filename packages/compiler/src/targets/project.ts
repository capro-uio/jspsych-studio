import type { SchemaBundle } from "@jspsych-studio/schemas";
import { assetPath } from "../assets.ts";
import { compileSpec } from "../compile.ts";
import { formatSource } from "../format.ts";
import {
  datasetDescription,
  generatorLabel,
  sourceHeader,
  type MetadataOptions,
} from "../metadata.ts";
import { emitHtml } from "./html.ts";
import type { Spec } from "../types.ts";

export type ProjectFile = string | Uint8Array;

const SOURCE_FILE = "experiment.js";
const PROJECT_FILE = "experiment.json";
const METADATA_FILE = "dataset_description.json";

function decodeDataUrl(url: string) {
  const comma = url.indexOf(",");
  const header = url.slice(0, comma);
  const body = url.slice(comma + 1);
  if (!header.includes(";base64")) return new TextEncoder().encode(decodeURIComponent(body));
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function readme(spec: Spec, assetCount: number, options: MetadataOptions) {
  return `# ${spec.name}

Built with ${generatorLabel(options.studio)}.

## Running it

Open \`index.html\` in a browser to try it on this computer. To collect data, put
these files on any web host — a university server, GitHub Pages, or whatever your
department uses — and give participants the address.

## What is here

- \`index.html\` — the page participants open
- \`${SOURCE_FILE}\` — the experiment itself, as jsPsych. Yours to read and change
- \`${PROJECT_FILE}\` — the project file; open this in the builder to keep editing
- \`${METADATA_FILE}\` — what the data will contain, in [Psych-DS](https://psych-ds.github.io/) form
${assetCount > 0 ? `- \`assets/\` — the ${assetCount} file(s) the experiment shows\n` : ""}
## Where the data goes

${
  spec.data?.save === "post"
    ? `Results are uploaded to ${spec.data.endpoint ?? "DataPipe"} under the experiment id \`${spec.data.experiment_id}\`. If an upload fails, the participant is asked to download the file and send it to you.`
    : spec.data?.save === "download"
      ? "Each participant's results download to their own computer at the end. You will need to collect those files from them."
      : "This experiment does not keep its results. Choose where data should go in the builder before recruiting anyone."
}
`;
}

/**
 * Everything needed to host the experiment: the page, the experiment as readable jsPsych, the
 * media as real files, and the project file so it can be opened again.
 */
export async function projectFiles(
  spec: Spec,
  bundle: SchemaBundle,
  options: Partial<MetadataOptions> = {},
) {
  const compiled = compileSpec(spec, bundle, { assets: "files" });
  const metadata: MetadataOptions = { jspsych: compiled.jspsych, ...options };
  const { html } = await emitHtml(compiled, {
    title: spec.name,
    sourceFile: SOURCE_FILE,
    studio: metadata.studio,
  });

  const files: Record<string, ProjectFile> = {
    "index.html": html,
    [SOURCE_FILE]: sourceHeader(spec, metadata) + (await formatSource(compiled.source)),
    [PROJECT_FILE]: `${JSON.stringify(spec, null, 2)}\n`,
    [METADATA_FILE]: `${JSON.stringify(datasetDescription(spec, metadata), null, 2)}\n`,
    "README.md": readme(spec, spec.assets?.length ?? 0, metadata),
  };

  for (const asset of spec.assets ?? []) {
    files[assetPath(asset)] = decodeDataUrl(asset.url);
  }
  return files;
}
