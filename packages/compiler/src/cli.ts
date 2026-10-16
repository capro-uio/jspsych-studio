#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { extractSchemas, pluginPackages } from "@jspsych-studio/schemas";
import { compileSpec } from "./compile.ts";
import { emitHtml } from "./targets/html.ts";
import { SpecError } from "./validate.ts";
import type { Spec } from "./types.ts";

function optionValue(name: string, fallback: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const [command, specPath] = process.argv.slice(2);

if (command !== "compile" || !specPath) {
  console.error("usage: jspsych-studio compile <spec.json> [--out <file>] [--base <cdn|path>]");
  process.exit(2);
}

const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
const report = await extractSchemas(pluginPackages());
const schemas = { jspsych: report.jspsych, plugins: report.schemas };

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
