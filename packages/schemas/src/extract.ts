import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type {
  ExtractionReport,
  ParameterSchema,
  ParameterTypeName,
  PluginSchema,
  PluginSchemas,
} from "./types.ts";
import { CURATED_PLUGINS } from "./curated.ts";

const JSON_TYPE: Record<ParameterTypeName, Partial<ParameterSchema>> = {
  BOOL: { type: "boolean" },
  STRING: { type: "string" },
  INT: { type: "integer" },
  FLOAT: { type: "number" },
  FUNCTION: { type: "string", format: "expression" },
  KEY: { type: "string", format: "keyboard-key" },
  KEYS: { type: "array", items: { type: "string", format: "keyboard-key" } as ParameterSchema },
  SELECT: { type: "string" },
  HTML_STRING: { type: "string", format: "html" },
  IMAGE: { type: "string", format: "asset-image" },
  AUDIO: { type: "string", format: "asset-audio" },
  VIDEO: { type: "string", format: "asset-video" },
  OBJECT: { type: "object" },
  COMPLEX: { type: "object" },
  TIMELINE: { type: "array", format: "timeline" },
};

export interface RawParameter {
  type: number;
  default?: unknown;
  array?: boolean;
  pretty_name?: string;
  description?: string;
  options?: unknown[];
  nested?: Record<string, RawParameter>;
}

// jsPsych's ESM build assigns to `window` at import time, so Node needs a stand-in.
async function importWithWindowShim(specifier: string): Promise<Record<string, unknown>> {
  const globals = globalThis as { window?: unknown };
  globals.window ??= globalThis;
  return (await import(specifier)) as Record<string, unknown>;
}

function parameterTypeNames(parameterType: Record<string, unknown>) {
  const names = new Map<number, ParameterTypeName>();
  for (const [name, value] of Object.entries(parameterType)) {
    if (typeof value === "number") names.set(value, name as ParameterTypeName);
  }
  return names;
}

// jsPsych packages declare `exports` without a "./package.json" entry, so the entry point is the
// only resolvable path; its sibling declaration file is where the JSDoc survives. `require.resolve`
// is used rather than `import.meta.resolve` because the latter is rewritten under Vite.
const resolveFrom = createRequire(import.meta.url);

function declarationsPath(packageName: string) {
  return join(dirname(resolveFrom.resolve(packageName)), "index.d.ts");
}

function installedVersion(packageName: string) {
  const manifest = join(dirname(resolveFrom.resolve(packageName)), "..", "package.json");
  return (JSON.parse(readFileSync(manifest, "utf8")) as { version: string }).version;
}

export function readDescriptions(packageName: string) {
  const declarations = readFileSync(declarationsPath(packageName), "utf8");
  const descriptions: Record<string, string> = {};
  const commentedKey = /\/\*\*([\s\S]*?)\*\/\s*(?:readonly\s+)?["']?([A-Za-z0-9_]+)["']?\s*:/g;
  for (const match of declarations.matchAll(commentedKey)) {
    const text = match[1]
      .replace(/^\s*\*\s?/gm, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!(match[2] in descriptions) && text) descriptions[match[2]] = text;
  }
  return descriptions;
}

// A plugin's own default function is the most useful place for an author's code to start, but a
// function cannot sit in JSON, so its source is kept as a code example instead, re-indented to
// read on its own.
export function functionSource(fn: (...args: never[]) => unknown) {
  const indentOf = (line: string) => /^[ \t]*/.exec(line)![0].length;
  const [first, ...rest] = fn.toString().split("\n");
  const indents = rest.filter((line) => line.trim() !== "").map(indentOf);
  const closing = rest.length > 0 ? indentOf(rest[rest.length - 1]) : 0;
  const strip = Math.min(closing, ...indents);
  return [first, ...rest.map((line) => line.slice(strip))].join("\n");
}

export function toParameterSchema(
  name: string,
  raw: RawParameter,
  typeNames: Map<number, ParameterTypeName>,
  descriptions: Record<string, string>,
): ParameterSchema {
  const jspsychType = typeNames.get(raw.type) ?? "OBJECT";
  let schema = { ...JSON_TYPE[jspsychType], jspsychType } as ParameterSchema;
  if (raw.array && schema.type !== "array") {
    // The entries of a list are of the parameter's type too, and whatever edits one of them needs
    // to know that: a list of HTML strings is a list of HTML strings, not of anonymous values.
    schema = { type: "array", items: schema, jspsychType } as ParameterSchema;
  }
  schema.title = raw.pretty_name ?? name.replace(/_/g, " ");
  const description = descriptions[name] ?? raw.description;
  if (description) schema.description = description;
  if (typeof raw.default === "function") {
    schema.examples = [{ code: functionSource(raw.default as () => unknown) }];
  } else if ("default" in raw) {
    schema.default = raw.default;
  }
  if (raw.options) {
    // A list of choices holds several options, not one, so the options constrain each entry.
    const chosen = schema.type === "array" && schema.items ? schema.items : schema;
    chosen.enum = raw.options;
  }
  if (raw.nested) {
    const nested = toObjectSchema(raw.nested, typeNames, descriptions);
    if (schema.type === "array") schema.items = nested as ParameterSchema;
    else Object.assign(schema, nested);
  }
  return schema;
}

function toObjectSchema(
  parameters: Record<string, RawParameter>,
  typeNames: Map<number, ParameterTypeName>,
  descriptions: Record<string, string>,
) {
  const properties: Record<string, ParameterSchema> = {};
  const required: string[] = [];
  for (const [name, raw] of Object.entries(parameters)) {
    properties[name] = toParameterSchema(name, raw, typeNames, descriptions);
    if (!("default" in raw) || raw.default === undefined) required.push(name);
  }
  return { properties, required };
}

async function extractOne(
  packageName: string,
  typeNames: Map<number, ParameterTypeName>,
  failures: ExtractionReport["failures"],
): Promise<PluginSchema> {
  const module = await importWithWindowShim(packageName);
  const candidates = [module.default, ...Object.values(module)];
  const plugin = candidates.find((value: unknown) => {
    return typeof value === "function" && "info" in (value as object);
  }) as { info: { name: string; version: string; parameters: Record<string, RawParameter> } };
  if (!plugin) throw new Error("no exported class with a static `info` property");

  let descriptions: Record<string, string> = {};
  try {
    descriptions = readDescriptions(packageName);
  } catch {
    failures.push({ package: packageName, reason: "no dist/index.d.ts; forms lose help text" });
  }

  const { properties, required } = toObjectSchema(plugin.info.parameters, typeNames, descriptions);
  const schema = {
    plugin: plugin.info.name,
    package: packageName,
    version: plugin.info.version,
    properties,
    required,
  };
  return CURATED_PLUGINS[packageName]?.(schema) ?? schema;
}

export async function extractSchemas(packageNames: string[]): Promise<ExtractionReport> {
  const { ParameterType } = await importWithWindowShim("jspsych");
  const typeNames = parameterTypeNames(ParameterType as Record<string, unknown>);

  const schemas: PluginSchemas = {};
  const failures: ExtractionReport["failures"] = [];
  let parameters = 0;
  let described = 0;

  const extracted = await Promise.all(
    packageNames.map(async (packageName) => {
      try {
        return { packageName, schema: await extractOne(packageName, typeNames, failures) };
      } catch (error) {
        failures.push({ package: packageName, reason: (error as Error).message });
        return null;
      }
    }),
  );

  for (const result of extracted) {
    if (!result) continue;
    schemas[result.schema.plugin] = result.schema;
    parameters += Object.keys(result.schema.properties).length;
    described += Object.values(result.schema.properties).filter((p) => p.description).length;
  }

  return {
    jspsych: installedVersion("jspsych"),
    schemas,
    coverage: { parameters, described, ratio: parameters === 0 ? 0 : described / parameters },
    failures,
  };
}

export function officialPluginPackages(): string[] {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { devDependencies: Record<string, string> };
  return Object.keys(manifest.devDependencies).filter((name) => name.includes("/plugin-"));
}

/** jsPsych's own plugins plus the third-party ones whose gaps are filled in by hand. */
export function pluginPackages(): string[] {
  return [...officialPluginPackages(), ...Object.keys(CURATED_PLUGINS)];
}
