import type { SchemaBundle } from "@tachisto/schemas";
import { assetPath } from "../assets.ts";
import { compileSpec } from "../compile.ts";
import { ENDING_COLUMN } from "../data.ts";
import {
  completionUrlOf,
  earlyEndingNames,
  endingOf,
  idParamOf,
  retentionOf,
} from "../recruitment.ts";
import { formatSource } from "../format.ts";
import {
  datasetDescription,
  generatorLabel,
  sourceHeader,
  type MetadataOptions,
} from "../metadata.ts";
import { emitHtml } from "./html.ts";
import type { Retention, Spec } from "../types.ts";

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

Built with ${generatorLabel(options.tachisto)}.

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
${recruitmentSection(spec)}`;
}

function recruitmentSection(spec: Spec) {
  if (!spec.recruitment) return "";
  const idParam = idParamOf(spec.recruitment);
  const url = completionUrlOf(spec.recruitment);
  return `
## Recruiting

Each participant's id is read from the \`${idParam}\` parameter of the link they arrive by, and
recorded as \`participant_id\`. Without it they are given a random id.${
    url
      ? ` Once their data is uploaded they are sent to ${url}, or, if the upload fails, shown a link
to it once their file has downloaded.`
      : ""
  }
${earlyEndingsNote(spec)}`;
}

const KEPT: Record<Retention, string> = {
  all: "all their data is kept",
  checkpoint: "only that row is kept",
  nothing: "nothing is kept or sent",
};

// Whoever hosts the study has to be able to tell an ethics board what happens to a participant
// who leaves early, without reading the code.
function earlyEndingsNote(spec: Spec) {
  const early = earlyEndingNames(spec.recruitment);
  if (early.length === 0) return "";
  const kept = early.map((name) => {
    return `- \`${name}\`: ${KEPT[retentionOf(endingOf(spec.recruitment, name))]}\n`;
  });
  return (
    `\nThe study can also end early. A participant who does gets a row naming the ending in the ` +
    `\`${ENDING_COLUMN}\` column, and then:\n\n${kept.join("")}`
  );
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
    tachisto: metadata.tachisto,
  });

  const files: Record<string, ProjectFile> = {
    "index.html": html,
    [SOURCE_FILE]: sourceHeader(spec, metadata) + (await formatSource(compiled.source)),
    [PROJECT_FILE]: `${JSON.stringify(spec, null, 2)}\n`,
    [METADATA_FILE]: `${JSON.stringify(datasetDescription(spec, compiled.columns, metadata), null, 2)}\n`,
    "README.md": readme(spec, spec.assets?.length ?? 0, metadata),
  };

  for (const asset of spec.assets ?? []) {
    files[assetPath(asset)] = decodeDataUrl(asset.url);
  }
  return files;
}
