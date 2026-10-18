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
  /** How many entries a list takes, where its plugin reads a fixed number of them. */
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
}

export type PluginSchemas = Record<string, PluginSchema>;

export interface SchemaBundle {
  /** The jsPsych release these schemas were extracted against. */
  jspsych: string;
  /** What each family of plugins is for, in the order a builder lists them. */
  families: Record<PluginFamily, string>;
  plugins: PluginSchemas;
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
