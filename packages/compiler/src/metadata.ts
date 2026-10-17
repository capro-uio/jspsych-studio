import manifest from "../package.json" with { type: "json" };
import { orderColumn } from "./counterbalance.ts";
import { ENDING_COLUMN } from "./data.ts";
import { idParamOf } from "./recruitment.ts";
import { slotsOf } from "./variables.ts";
import type { Author, Spec, SpecNode } from "./types.ts";

/** The version every workspace carries until a release sets a real one. */
const UNRELEASED = "0.0.0";

export const GENERATOR = "jsPsych Studio";
export const GENERATOR_URL = "https://github.com/capro-uio/jspsych-studio";
export const JSPSYCH_URL = "https://www.jspsych.org/";

/**
 * Which Studio produced the output, or undefined until the first release. The workspaces sit at
 * 0.0.0 before then, and a dataset claiming to come from "jsPsych Studio 0.0.0" identifies
 * nothing; provenance leaves the version out while that is true and starts carrying it the moment
 * a release bumps the manifest.
 */
export const GENERATOR_VERSION: string | undefined =
  manifest.version === UNRELEASED ? undefined : manifest.version;

/** The generator as people and parsers should see it: "jsPsych Studio 1.2.0", or the bare name. */
export function generatorLabel(version = GENERATOR_VERSION) {
  return version ? `${GENERATOR} ${version}` : GENERATOR;
}

/** Columns jsPsych writes for every trial, whatever the experiment does. */
const ALWAYS_RECORDED = ["trial_type", "trial_index", "time_elapsed", "plugin_version"];

/**
 * The columns this experiment's data will have. Psych-DS asks for every variable in the dataset,
 * and the spec already says which ones the experiment creates.
 */
export function dataColumns(spec: Spec): string[] {
  const columns = new Set(ALWAYS_RECORDED);
  if (spec.data) {
    columns.add("participant_id");
    columns.add("experiment");
    columns.add(idParamOf(spec.recruitment));
  }

  const walk = (nodes: SpecNode[]) => {
    for (const node of nodes) {
      if (node.kind === "trial") {
        if (node.tag) columns.add("tag");
        if (node.score) columns.add("correct");
        for (const field of Object.keys(node.record ?? {})) columns.add(field);
        columns.add("rt");
        columns.add("response");
        continue;
      }
      if (node.kind === "checkpoint") {
        columns.add("checkpoint");
        continue;
      }
      if (node.kind === "end") {
        columns.add(ENDING_COLUMN);
        continue;
      }
      if (node.kind === "assign") columns.add(node.record_as ?? "group");
      if (node.kind === "counterbalance") columns.add(orderColumn(node));
      const slots = slotsOf(node);
      if (slots) slots.forEach((slot) => walk(slot.children));
      else if (node.kind === "block" || node.kind === "loop") walk(node.children);
    }
  };
  walk(spec.timeline);
  return [...columns].sort();
}

export interface MetadataOptions {
  /** When the files were produced; given explicitly so output can be reproduced. */
  generatedAt?: string;
  jspsych: string;
  /** Which Studio built it; defaults to this build's own version. */
  studio?: string;
}

function person(author: Author) {
  return {
    "@type": "Person",
    name: author.name,
    ...(author.identifier ? { identifier: author.identifier } : {}),
  };
}

/** Psych-DS metadata, so the data arrives described rather than as a bare CSV. */
export function datasetDescription(spec: Spec, options: MetadataOptions) {
  const authors = (spec.authors ?? []).filter((author) => author.name.trim());
  const studio = options.studio ?? GENERATOR_VERSION;
  return {
    "@context": "https://schema.org/",
    "@type": "Dataset",
    name: spec.name,
    description: `Behavioural data from "${spec.name}", an experiment built with ${GENERATOR}.`,
    variableMeasured: dataColumns(spec),
    dateCreated: options.generatedAt ?? new Date().toISOString().slice(0, 10),
    // The people who made the experiment. Software belongs under isBasedOn, not here: author and
    // producer mean a person or an organisation, and a tool is neither.
    ...(authors.length > 0 ? { author: authors.map(person) } : {}),
    // Both tools, in the order they acted: Studio generated the experiment, jsPsych ran it and
    // wrote the rows. Each carries its version, so a dataset says what produced it.
    isBasedOn: [
      {
        "@type": "SoftwareApplication",
        name: GENERATOR,
        url: GENERATOR_URL,
        ...(studio ? { softwareVersion: studio } : {}),
      },
      {
        "@type": "SoftwareApplication",
        name: "jsPsych",
        url: JSPSYCH_URL,
        softwareVersion: options.jspsych,
      },
    ],
  };
}

export type DatasetDescription = ReturnType<typeof datasetDescription>;

/** A note at the top of the generated experiment saying where it came from. */
export function sourceHeader(spec: Spec, options: MetadataOptions) {
  const date = options.generatedAt ?? new Date().toISOString().slice(0, 10);
  return (
    `/*\n` +
    ` * ${spec.name}\n` +
    ` *\n` +
    ` * Built with ${generatorLabel(options.studio)} on ${date}, for jsPsych ${options.jspsych}.\n` +
    ` * ${GENERATOR_URL}\n` +
    ` *\n` +
    ` * This file is generated from experiment.json. Open that file in the builder to keep\n` +
    ` * editing there, or edit this file directly and keep it as the experiment from now on.\n` +
    ` */\n\n`
  );
}
