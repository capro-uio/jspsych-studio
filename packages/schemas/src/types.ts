import type { PluginFamily } from "./titles.ts";

export type ParameterTypeName =
  | "BOOL"
  | "STRING"
  | "INT"
  | "FLOAT"
  | "FUNCTION"
  | "KEY"
  | "KEYS"
  | "SELECT"
  | "HTML_STRING"
  | "IMAGE"
  | "AUDIO"
  | "VIDEO"
  | "OBJECT"
  | "COMPLEX"
  | "TIMELINE";

export interface ParameterSchema {
  title: string;
  description?: string;
  type?: string;
  format?: string;
  items?: ParameterSchema;
  properties?: Record<string, ParameterSchema>;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  /** Values a new step can start from, so it is not born invalid. */
  examples?: unknown[];
  /** How many entries a list takes, where its plugin reads a fixed number of them, or a grid's row. */
  minItems?: number;
  maxItems?: number;
  /** For a set of fields whose meaning depends on one of them, such as a canvas object's shape. */
  variants?: Variants;
  /** A purpose-built editor the builder offers in place of the generic form. */
  editor?: "canvas";
  jspsychType: ParameterTypeName;
}

export interface Variant {
  /** The fields this variant reads, beyond the shared ones. */
  properties: string[];
  required: string[];
  /** Groups of fields of which at least one must be set. */
  any_of?: string[][];
  /** Groups of fields of which at most one may be set. */
  at_most_one_of?: string[][];
}

export interface Variants {
  /** The field whose value picks the variant. */
  by: string;
  /** The fields every variant reads. */
  shared: string[];
  options: Record<string, Variant>;
}

export interface PluginSchema {
  plugin: string;
  /** What an author calls the step; `plugin` stays the name the spec and jsPsych use. */
  title: string;
  summary: string;
  family: PluginFamily;
  package: string;
  version: string;
  properties: Record<string, ParameterSchema>;
  required: string[];
  /** The columns the plugin writes into each row of data it records, as its info declares. */
  records: string[];
  /** Pairs of key parameters that must differ, as same and different do, or its answers mean nothing. */
  distinctKeys?: [string, string][];
  /** The CSS selector of the element the plugin shows its stimulus in, where it gives it an id. */
  stimulusSelector?: string;
}

export type PluginSchemas = Record<string, PluginSchema>;

/** A script an extension needs on the page before it, such as the eye tracker WebGazer drives. */
export interface Library {
  package: string;
  version: string;
  /** The script's path inside the package. */
  file: string;
}

export interface ExtensionSchema {
  /** The name jsPsych knows the extension by, as in `jsPsych.extensions.webgazer`. */
  extension: string;
  package: string;
  version: string;
  /** The columns the extension adds to each row of a step it runs on. */
  records: string[];
  libraries: Library[];
}

/** A package as a download credits it: which release, under which licence, and where it is. */
export interface PackageCredit {
  package: string;
  version: string;
  /** The package's licence, as its manifest names it, such as MIT. */
  license: string;
  /** Where the package's source and full licence text are published. */
  source: string;
}

/** The files a study's page loads from one package, each with the hash a copy of it must match. */
export interface PackageFiles extends Omit<PackageCredit, "package"> {
  /** The subresource-integrity hash (sha384) of each file, by its path inside the package. */
  files: Record<string, string>;
  /** Packages built into this one's files, which a copy of them carries too. */
  bundles?: PackageCredit[];
  /**
   * The scripts and stylesheets that hold text which would end the element a page writes them
   * into, so a page can only load them from a file.
   */
  breaksOutOfPage?: string[];
}

export interface SchemaBundle {
  /** The jsPsych release these schemas were extracted against. */
  jspsych: string;
  /** What each family of plugins is for, in the order a builder lists them. */
  families: Record<PluginFamily, string>;
  plugins: PluginSchemas;
  extensions: Record<string, ExtensionSchema>;
  /** Every file a page can load, by package, so a download can carry its own verified copies. */
  packages: Record<string, PackageFiles>;
}

export interface ExtractionReport {
  jspsych: string;
  schemas: PluginSchemas;
  coverage: { parameters: number; described: number; ratio: number };
  /** Packages left out of the schemas, and why. */
  failures: { package: string; reason: string }[];
  /** Packages extracted with something missing, such as their help text. */
  warnings: { package: string; reason: string }[];
}
