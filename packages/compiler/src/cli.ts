#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { format, resolveConfig } from "prettier";
import { fileURLToPath } from "node:url";
import { extractSchemas, pluginPackages } from "@jspsych-studio/schemas";
import manifest from "../package.json" with { type: "json" };
import { updateCodemeta, type Codemeta, type PackageManifest } from "./codemeta.ts";
import { compileSpec } from "./compile.ts";
import { emitHtml } from "./targets/html.ts";
import { specSchema } from "./spec-schema.ts";
import { SpecError } from "./validate.ts";
import type { Spec } from "./types.ts";

function optionValue(name: string, fallback: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const [command, specPath] = process.argv.slice(2);

if (!["compile", "schema", "codemeta"].includes(command) || (command === "compile" && !specPath)) {
  console.error(
    "usage: jspsych-studio compile <spec.json> [--out <file>] [--base <cdn|path>]\n" +
      "       jspsych-studio schema [--out <file>]\n" +
      "       jspsych-studio codemeta [--out <file>]",
  );
  process.exit(2);
}

const report = await extractSchemas(pluginPackages());
const schemas = { jspsych: report.jspsych, plugins: report.schemas };

if (command === "schema") {
  const outputPath = optionValue(
    "out",
    fileURLToPath(new URL("../spec-schema.json", import.meta.url)),
  );
  writeFileSync(outputPath, `${JSON.stringify(specSchema(schemas.plugins), null, 2)}\n`);
  const count = Object.keys(schemas.plugins).length;
  console.log(`spec schema for jsPsych ${report.jspsych}, ${count} plugin(s) -> ${outputPath}`);
  process.exit(0);
}

if (command === "codemeta") {
  const outputPath = optionValue(
    "out",
    fileURLToPath(new URL("../../../codemeta.json", import.meta.url)),
  );
  const repositoryManifest = fileURLToPath(new URL("../../../package.json", import.meta.url));
  const updated = updateCodemeta(
    JSON.parse(readFileSync(outputPath, "utf8")) as Codemeta,
    JSON.parse(readFileSync(repositoryManifest, "utf8")) as PackageManifest,
    {
      version: manifest.version,
      jspsych: report.jspsych,
      date: new Date().toISOString().slice(0, 10),
    },
  );
  // Formatted as the repository formats it, so a regeneration diffs only where something changed.
  const options = { ...(await resolveConfig(outputPath)), filepath: outputPath };
  writeFileSync(outputPath, await format(JSON.stringify(updated), options));
  console.log(`codemeta for jsPsych Studio ${manifest.version} -> ${outputPath}`);
  process.exit(0);
}

const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;

try {
  const result = compileSpec(spec, schemas);
  const { html } = await emitHtml(result, { title: spec.name, base: optionValue("base", "cdn") });
  const outputPath = optionValue("out", `${basename(specPath, ".json")}.html`);
  writeFileSync(outputPath, html);
  console.log(`${spec.name}: ${result.plugins.length} plugin(s) -> ${outputPath}`);
} catch (error) {
  if (!(error instanceof SpecError)) throw error;
  console.error(error.message);
  process.exit(1);
}
