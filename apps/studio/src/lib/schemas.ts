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
    .filter(
      ([, parameter]) =>
        EDITABLE_TYPES.has(parameter.jspsychType) || Boolean(parameter.items?.properties),
    )
    .map(([name, parameter]) => ({
      name,
      parameter,
      required: schema.required.includes(name),
    }));
}

const PLACEHOLDER_TEXT = "<p>Your text here</p>";

/** Required text parameters get placeholder content so a new step is not born invalid. */
export function startingParams(plugin: string): Record<string, unknown> {
  const schema = schemas.plugins[plugin];
  if (!schema) return {};
  const params: Record<string, unknown> = {};
  for (const name of schema.required) {
    const parameter = schema.properties[name];
    if (parameter?.jspsychType !== "HTML_STRING") continue;
    params[name] = parameter.type === "array" ? [PLACEHOLDER_TEXT] : PLACEHOLDER_TEXT;
  }
  return params;
}
