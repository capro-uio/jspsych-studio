import schemaFile from "@jspsych-studio/schemas/plugin-schemas.json";
import type { SchemaBundle } from "@jspsych-studio/schemas";

export const schemas = schemaFile as unknown as SchemaBundle;

export const pluginNames = Object.keys(schemas.plugins).sort();

const EDITABLE_TYPES = new Set([
  "BOOL",
  "STRING",
  "INT",
  "FLOAT",
  "KEY",
  "KEYS",
  "SELECT",
  "HTML_STRING",
  "IMAGE",
  "AUDIO",
  "VIDEO",
]);

export function editableParameters(plugin: string) {
  const schema = schemas.plugins[plugin];
  if (!schema) return [];
  return Object.entries(schema.properties)
    .filter(([, parameter]) => EDITABLE_TYPES.has(parameter.jspsychType))
    .map(([name, parameter]) => ({
      name,
      parameter,
      required: schema.required.includes(name),
    }));
}
