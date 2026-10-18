import schemaFile from "@jspsych-studio/schemas/plugin-schemas.json";
import type { ParameterSchema, SchemaBundle, Variants } from "@jspsych-studio/schemas";

export const schemas = schemaFile as unknown as SchemaBundle;

/** What an author calls a plugin's step; the machine name for one the schemas do not know. */
export function pluginTitle(plugin: string) {
  return Object.hasOwn(schemas.plugins, plugin) ? schemas.plugins[plugin].title : plugin;
}

/** The plugins an author can choose from, grouped by what the step is for and sorted by title. */
export const pluginChoices = Object.entries(schemas.families)
  .map(([family, label]) => ({
    label,
    plugins: Object.values(schemas.plugins)
      .filter((schema) => schema.family === family)
      .sort((a, b) => a.title.localeCompare(b.title, "en"))
      .map(({ plugin, title }) => ({ plugin, title })),
  }))
  .filter((group) => group.plugins.length > 0);

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

/**
 * Required parameters start from the schema's example, or placeholder text for text parameters,
 * so a new step is not born invalid.
 */
export function startingParams(plugin: string): Record<string, unknown> {
  const schema = schemas.plugins[plugin];
  if (!schema) return {};
  const params: Record<string, unknown> = {};
  for (const name of schema.required) {
    const parameter = schema.properties[name];
    if (parameter?.examples?.length) {
      params[name] = structuredClone(parameter.examples[0]);
    } else if (parameter?.jspsychType === "HTML_STRING") {
      params[name] = parameter.type === "array" ? [PLACEHOLDER_TEXT] : PLACEHOLDER_TEXT;
    }
  }
  return params;
}

/** The fields an entry of a list shows: for one with variants, only those its variant reads. */
export function visibleFields(schema: ParameterSchema, value: Record<string, unknown>) {
  const fields = Object.entries(schema.properties ?? {});
  const variants = schema.variants;
  if (!variants) return fields;
  const chosen = variants.options[value[variants.by] as string];
  const shown = new Set([variants.by, ...variants.shared, ...(chosen?.properties ?? [])]);
  return fields.filter(([name]) => shown.has(name) || name in value);
}

/**
 * Changing an entry's variant drops the fields only the old one read, rather than leave them;
 * fields no variant claims, such as motion, are kept.
 */
export function switchVariant(variants: Variants, value: Record<string, unknown>, next: string) {
  const claimed = new Set(Object.values(variants.options).flatMap((option) => option.properties));
  const reads = new Set([...variants.shared, ...(variants.options[next]?.properties ?? [])]);
  const fields = Object.entries(value).filter(
    ([name]) => name !== variants.by && (!claimed.has(name) || reads.has(name)),
  );
  return { [variants.by]: next, ...Object.fromEntries(fields) };
}
