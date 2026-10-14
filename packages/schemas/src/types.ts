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
  jspsychType: ParameterTypeName;
}

export interface PluginSchema {
  plugin: string;
  package: string;
  version: string;
  properties: Record<string, ParameterSchema>;
  required: string[];
}

export type PluginSchemas = Record<string, PluginSchema>;

export interface SchemaBundle {
  /** The jsPsych release these schemas were extracted against. */
  jspsych: string;
  plugins: PluginSchemas;
}

export interface ExtractionReport {
  jspsych: string;
  schemas: PluginSchemas;
  coverage: { parameters: number; described: number; ratio: number };
  failures: { package: string; reason: string }[];
}
