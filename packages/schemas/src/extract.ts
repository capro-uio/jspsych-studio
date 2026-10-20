import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { BROWSER_BUNDLE, JSPSYCH_STYLESHEET, integrityOf } from "./files.ts";
import type {
  ExtensionSchema,
  ExtractionReport,
  ParameterSchema,
  ParameterTypeName,
  PluginSchema,
  PluginSchemas,
  PackageFiles,
  SchemaBundle,
} from "./types.ts";
import {
  CURATED_PLUGINS,
  DISTINCT_KEYS,
  EXTENSION_LIBRARIES,
  LIBRARY_RUNTIME_FILES,
  FIXED_CHOICES,
  DECIMAL_PARAMETERS,
  GRID_WIDTHS,
  STIMULUS_ELEMENTS,
  LIST_LENGTHS,
  REQUIRED_PARAMETERS,
  STARTING_EXAMPLES,
  UNDECLARED_RECORDS,
} from "./curated.ts";
import { PLUGIN_FAMILIES, PLUGIN_LABELS, type PluginLabel } from "./titles.ts";

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

/** The folder a package is installed in: the nearest above its entry point that names it. */
function packageRoot(packageName: string) {
  let folder = dirname(resolveFrom.resolve(packageName));
  for (;;) {
    const manifest = join(folder, "package.json");
    if (existsSync(manifest)) {
      const { name } = JSON.parse(readFileSync(manifest, "utf8")) as { name?: string };
      if (name === packageName) return folder;
    }
    const parent = dirname(folder);
    if (parent === folder) throw new Error(`cannot find where ${packageName} is installed`);
    folder = parent;
  }
}

interface Manifest {
  version: string;
  license?: string;
  repository?: string | { url?: string; directory?: string };
  homepage?: string;
}

const WEB_ADDRESS = /^https:\/\/[^\s<>|"]+$/;

/**
 * Where a package's source can be read: its repository, at the folder that holds it when it
 * shares one with others, as jsPsych's plugins do; else its home page; else its npm page.
 */
export function sourceOf(packageName: string, manifest: Manifest) {
  const repository =
    typeof manifest.repository === "string" ? { url: manifest.repository } : manifest.repository;
  const url = repository?.url
    ?.replace(/^git\+/, "")
    .replace(/^github:/, "https://github.com/")
    .replace(/\.git$/, "");
  // The address is written into a download's notice, so only a plain web address is taken.
  if (url && WEB_ADDRESS.test(url)) {
    return repository?.directory ? `${url}/tree/HEAD/${repository.directory}` : url;
  }
  if (manifest.homepage && WEB_ADDRESS.test(manifest.homepage)) return manifest.homepage;
  return `https://www.npmjs.com/package/${packageName}`;
}

/** The installed version of a package, its licence and source, and the hash of each file named. */
export async function packageFiles(packageName: string, paths: string[]): Promise<PackageFiles> {
  const root = packageRoot(packageName);
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Manifest;
  if (!manifest.license) throw new Error(`${packageName} names no licence`);
  const files = Object.fromEntries(
    await Promise.all(
      [...paths]
        .sort()
        .map(
          async (path) =>
            [path, await integrityOf(new Uint8Array(readFileSync(join(root, path))))] as const,
        ),
    ),
  );
  return {
    version: manifest.version,
    license: manifest.license,
    source: sourceOf(packageName, manifest),
    files,
  };
}

/** Every file a page can load: jsPsych and its stylesheet, each plugin, each extension and library. */
export async function filesFor(
  plugins: PluginSchemas,
  extensions: Record<string, ExtensionSchema>,
): Promise<Record<string, PackageFiles>> {
  const wanted = new Map<string, Set<string>>();
  const want = (packageName: string, ...paths: string[]) => {
    const files = wanted.get(packageName) ?? new Set<string>();
    for (const path of paths) files.add(path);
    wanted.set(packageName, files);
  };
  want("jspsych", BROWSER_BUNDLE, JSPSYCH_STYLESHEET);
  for (const plugin of Object.values(plugins)) want(plugin.package, BROWSER_BUNDLE);
  for (const extension of Object.values(extensions)) {
    want(extension.package, BROWSER_BUNDLE);
    for (const library of extension.libraries) {
      want(library.package, library.file, ...(LIBRARY_RUNTIME_FILES[library.package] ?? []));
    }
  }
  return Object.fromEntries(
    await Promise.all(
      [...wanted.keys()]
        .sort()
        .map(async (name) => [name, await packageFiles(name, [...wanted.get(name)!])] as const),
    ),
  );
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

// jsPsych declares a grid, such as serial-reaction-time's squares, as a list, and only its default
// shows that each entry is itself a row.
function isGrid(value: unknown): value is unknown[][] {
  return Array.isArray(value) && value.length > 0 && value.every(Array.isArray);
}

const CELL_TYPES: Record<string, string> = {
  number: "integer",
  string: "string",
  boolean: "boolean",
};

function gridOf(list: ParameterSchema, rows: unknown[][]): ParameterSchema {
  const cell = rows.flat()[0];
  const declared = list.items ?? list;
  return {
    ...list,
    type: "array",
    format: "grid",
    items: {
      title: "row",
      type: "array",
      jspsychType: list.jspsychType,
      items: {
        ...declared,
        title: "cell",
        type: CELL_TYPES[typeof cell] ?? declared.type,
        jspsychType: list.jspsychType,
        // A square is there (1) or not (0), as the plugins read it.
        ...(list.jspsychType === "BOOL" && { enum: [0, 1] }),
      },
    },
  };
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
  if (raw.array && isGrid(raw.default)) schema = gridOf(schema, raw.default);
  schema.title = raw.pretty_name ?? name.replace(/_/g, " ");
  const description = descriptions[name] ?? raw.description;
  if (description) schema.description = description;
  if (typeof raw.default === "function") {
    schema.examples = [{ code: functionSource(raw.default as () => unknown) }];
  } else if ("default" in raw) {
    // A number parameter defaulting to empty text, as video-keyboard-response's width does, means
    // none; null says so in a way the schema and the forms understand.
    const numeric = jspsychType === "INT" || jspsychType === "FLOAT";
    schema.default = numeric && raw.default === "" ? null : raw.default;
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

interface StaticInfo {
  name: string;
  version: string;
  data?: Record<string, unknown>;
}

// A plugin or an extension is the class its package exports with a static `info`.
async function infoOf<Extra>(packageName: string): Promise<{ info: StaticInfo & Extra }> {
  const module = await importWithWindowShim(packageName);
  const found = [module.default, ...Object.values(module)].find(
    (value: unknown) => typeof value === "function" && "info" in value,
  );
  if (!found) throw new Error(`${packageName} exports no class with a static \`info\``);
  return found as { info: StaticInfo & Extra };
}

async function extractOne(
  packageName: string,
  typeNames: Map<number, ParameterTypeName>,
  labels: Record<string, PluginLabel>,
  warnings: ExtractionReport["warnings"],
): Promise<PluginSchema> {
  const plugin = await infoOf<{ parameters: Record<string, RawParameter> }>(packageName);

  let descriptions: Record<string, string> = {};
  try {
    descriptions = readDescriptions(packageName);
  } catch {
    warnings.push({ package: packageName, reason: "no dist/index.d.ts; forms lose help text" });
  }

  if (!Object.hasOwn(labels, plugin.info.name)) {
    throw new Error(`plugin "${plugin.info.name}" has no title; add one to src/titles.ts`);
  }
  const { properties, required } = toObjectSchema(plugin.info.parameters, typeNames, descriptions);
  const schema = {
    plugin: plugin.info.name,
    ...labels[plugin.info.name],
    package: packageName,
    version: plugin.info.version,
    properties,
    required,
    records: [...recordedColumns(plugin.info), ...(UNDECLARED_RECORDS[plugin.info.name] ?? [])],
    ...stimulusSelectorOf(packageName, plugin.info.name),
  };
  curateParameters(schema);
  return CURATED_PLUGINS[packageName]?.(schema) ?? schema;
}

// Most of jsPsych's plugins show their stimulus in an element with an id of their own name, which
// is what an eye tracker can record the place of without the author writing a selector.
export function stimulusSelectorOf(
  packageName: string,
  plugin: string,
  curated: Record<string, string> = STIMULUS_ELEMENTS,
) {
  const isCurated = Object.hasOwn(curated, plugin);
  const id = isCurated ? curated[plugin] : `jspsych-${plugin}-stimulus`;
  const source = readFileSync(resolveFrom.resolve(packageName), "utf8");
  // Written into markup as id="…" or id='…', or set on an element as `.id = "…"`; a plugin's name
  // is letters and hyphens, so the id needs no escaping.
  const assigned = new RegExp(`id ?= ?["']${id}["']`).test(source);
  if (!assigned && isCurated) {
    throw new Error(
      `curated.ts names "${id}" as the stimulus of ${plugin}, which no longer has it`,
    );
  }
  return assigned ? { stimulusSelector: `#${id}` } : {};
}

export interface ParameterCuration {
  examples: Record<string, Record<string, unknown>>;
  lengths: Record<string, Record<string, { minItems?: number; maxItems?: number }>>;
  choices: Record<string, Record<string, string[]>>;
  distinctKeys: Record<string, [string, string][]>;
  required: Record<string, string[]>;
  decimals: Record<string, string[]>;
  widths: Record<string, Record<string, number>>;
}

/** Fills in what a plugin's declarations leave out for some of its parameters, named by plugin. */
export function curateParameters(
  schema: PluginSchema,
  curation: ParameterCuration = {
    examples: STARTING_EXAMPLES,
    lengths: LIST_LENGTHS,
    choices: FIXED_CHOICES,
    distinctKeys: DISTINCT_KEYS,
    required: REQUIRED_PARAMETERS,
    decimals: DECIMAL_PARAMETERS,
    widths: GRID_WIDTHS,
  },
) {
  const named = <T>(table: Record<string, Record<string, T>>) =>
    Object.entries(table[schema.plugin] ?? {}).map(([name, value]) => {
      const parameter = schema.properties[name];
      if (!parameter) {
        throw new Error(`curated.ts names "${name}", which ${schema.plugin} does not take`);
      }
      return [parameter, value] as const;
    });
  for (const [parameter, example] of named(curation.examples)) parameter.examples = [example];
  for (const [parameter, width] of named(curation.widths)) {
    if (parameter.format !== "grid" || !parameter.items) {
      throw new Error(`curated.ts gives a row width to "${parameter.title}", which is not a grid`);
    }
    Object.assign(parameter.items, { minItems: width, maxItems: width });
  }
  for (const [parameter, length] of named(curation.lengths)) Object.assign(parameter, length);
  for (const [parameter, choices] of named(curation.choices)) {
    if (parameter.type === "array" && parameter.items) parameter.items.enum = choices;
    else parameter.enum = choices;
  }
  const decimals = curation.decimals[schema.plugin] ?? [];
  for (const [parameter] of named({
    [schema.plugin]: Object.fromEntries(decimals.map((name) => [name, true])),
  })) {
    parameter.type = "number";
    parameter.jspsychType = "FLOAT";
  }
  const required = curation.required[schema.plugin] ?? [];
  named({ [schema.plugin]: Object.fromEntries(required.map((name) => [name, true])) });
  schema.required = [...new Set([...schema.required, ...required])];
  const pairs = curation.distinctKeys[schema.plugin] ?? [];
  // Named like the others, so a misspelt key is caught when the schemas are built.
  named({ [schema.plugin]: Object.fromEntries(pairs.flat().map((name) => [name, true])) });
  if (pairs.length > 0) schema.distinctKeys = pairs;
}

/** The columns a plugin writes into its data; an older plugin may declare none. */
export function recordedColumns(info: { data?: Record<string, unknown> }) {
  return Object.keys(info.data ?? {});
}

export async function extractSchemas(
  packageNames: string[],
  labels: Record<string, PluginLabel> = PLUGIN_LABELS,
): Promise<ExtractionReport> {
  const { ParameterType } = await importWithWindowShim("jspsych");
  const typeNames = parameterTypeNames(ParameterType as Record<string, unknown>);

  const schemas: PluginSchemas = {};
  const failures: ExtractionReport["failures"] = [];
  const warnings: ExtractionReport["warnings"] = [];
  let parameters = 0;
  let described = 0;

  const extracted = await Promise.all(
    packageNames.map(async (packageName) => {
      try {
        return { packageName, schema: await extractOne(packageName, typeNames, labels, warnings) };
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
    warnings,
  };
}

/** Throws when any plugin was left out, which would quietly drop it from the builder and specs. */
export function assertExtracted(report: ExtractionReport) {
  if (report.failures.length === 0) return;
  const reasons = report.failures.map((failure) => `  ! ${failure.package}: ${failure.reason}`);
  throw new Error(
    `${report.failures.length} plugin(s) could not be extracted:\n${reasons.join("\n")}`,
  );
}

function installedPackages() {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { devDependencies: Record<string, string> };
  return Object.keys(manifest.devDependencies);
}

export function officialPluginPackages(): string[] {
  return installedPackages().filter((name) => name.includes("/plugin-"));
}

export function extensionPackages(): string[] {
  return installedPackages().filter((name) => name.includes("/extension-"));
}

/** What each extension is called, records, and needs loaded before it. */
export async function extractExtensions(
  packageNames: string[],
): Promise<Record<string, ExtensionSchema>> {
  const extensions = await Promise.all(
    packageNames.map(async (packageName): Promise<ExtensionSchema> => {
      const { info } = await infoOf(packageName);
      return {
        extension: info.name,
        package: packageName,
        version: info.version,
        records: recordedColumns(info),
        libraries: (EXTENSION_LIBRARIES[packageName] ?? []).map((library) => ({
          ...library,
          version: installedVersion(library.package),
        })),
      };
    }),
  );
  return Object.fromEntries(extensions.map((extension) => [extension.extension, extension]));
}

/** jsPsych's own plugins plus the third-party ones whose gaps are filled in by hand. */
export function pluginPackages(): string[] {
  return [...officialPluginPackages(), ...Object.keys(CURATED_PLUGINS)];
}

/** The schemas a builder and the compiler work from, for the plugins named and every extension. */
export async function extractBundle(
  packageNames: string[] = pluginPackages(),
): Promise<{ bundle: SchemaBundle; report: ExtractionReport }> {
  const [report, extensions] = await Promise.all([
    extractSchemas(packageNames),
    extractExtensions(extensionPackages()),
  ]);
  assertExtracted(report);
  const bundle: SchemaBundle = {
    jspsych: report.jspsych,
    families: PLUGIN_FAMILIES,
    plugins: report.schemas,
    extensions,
    packages: await filesFor(report.schemas, extensions),
  };
  return { bundle, report };
}
