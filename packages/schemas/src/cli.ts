#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { extractSchemas, pluginPackages } from "./extract.ts";

const MINIMUM_COVERAGE = 0.95;

const outputPath = new URL("../plugin-schemas.json", import.meta.url);
const packages = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const report = await extractSchemas(packages.length > 0 ? packages : pluginPackages());

const bundle = { jspsych: report.jspsych, plugins: report.schemas };
writeFileSync(outputPath, `${JSON.stringify(bundle, null, 2)}\n`);

const { parameters, described, ratio } = report.coverage;
const percentage = (ratio * 100).toFixed(1);
console.log(
  `jsPsych ${report.jspsych}: ${Object.keys(report.schemas).length} plugins, ${parameters} parameters, ` +
    `${described} described (${percentage}%)`,
);
for (const failure of report.failures) console.warn(`  ! ${failure.package}: ${failure.reason}`);
console.log(`wrote ${outputPath.pathname}`);

if (ratio < MINIMUM_COVERAGE) {
  console.error(`description coverage ${percentage}% is below ${MINIMUM_COVERAGE * 100}%`);
  process.exit(1);
}
