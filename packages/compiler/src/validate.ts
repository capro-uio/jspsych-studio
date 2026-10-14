import type { ParameterSchema, PluginSchemas } from "@jspsych-studio/schemas";
import type { ParameterValue, Spec, SpecNode, TrialNode } from "./types.ts";
import { assetNames, isMediaParameter } from "./assets.ts";
import { conditionColumns, isVariableReference } from "./variables.ts";

export class SpecError extends Error {}

const RECIPE_SUPPLIED_PARAMETERS = new Set(["data", "on_finish"]);

function collectTags(nodes: SpecNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === "trial" ? (node.tag ? [node.tag] : []) : collectTags(node.children),
  );
}

const KEY_LIST_KEYWORDS = new Set(["ALL_KEYS", "NO_KEYS"]);

// Only the types the extractor resolved unambiguously. A KEYS parameter is a list that also
// accepts the strings "ALL_KEYS" and "NO_KEYS", so it is checked on its own terms.
function literalTypeProblem(value: ParameterValue, parameter: ParameterSchema) {
  if (parameter.type === "array") {
    if (Array.isArray(value)) return null;
    if (parameter.jspsychType === "KEYS" && KEY_LIST_KEYWORDS.has(value as string)) return null;
    return "expects a list of values";
  }
  if (parameter.type === "integer" || parameter.type === "number") {
    return typeof value === "number" ? null : "expects a number";
  }
  if (parameter.type === "boolean") {
    return typeof value === "boolean" ? null : "expects true or false";
  }
  return null;
}

function looksLikePath(value: string) {
  return value.includes("/") || value.includes(":");
}

function checkTrial(
  trial: TrialNode,
  spec: Spec,
  schemas: PluginSchemas,
  columns: Set<string>,
  problems: string[],
) {
  const assets = assetNames(spec.assets);
  const schema = schemas[trial.plugin];
  if (!schema) {
    problems.push(`unknown plugin "${trial.plugin}"`);
    return;
  }

  const where = `plugin "${trial.plugin}"`;
  const supplied = Object.entries(trial.params ?? {});

  for (const [name, value] of supplied) {
    const parameter = schema.properties[name];
    if (!parameter && !RECIPE_SUPPLIED_PARAMETERS.has(name)) {
      problems.push(`${where} has no parameter "${name}"`);
      continue;
    }
    if (!parameter) continue;
    if (isVariableReference(value)) {
      checkColumn(value.var, columns, `${where}, parameter "${name}"`, problems);
    } else if (isMediaParameter(trial.plugin, name, parameter.jspsychType)) {
      const named = (Array.isArray(value) ? value : [value]).filter(
        (entry): entry is string => typeof entry === "string" && entry !== "",
      );
      for (const entry of named) {
        if (assets.has(entry) || looksLikePath(entry)) continue;
        problems.push(
          `${where}, parameter "${name}" names "${entry}", which is neither an added file nor a ` +
            `path` +
            (assets.size > 0 ? ` (files added: ${[...assets].join(", ")})` : ""),
        );
      }
    } else if (parameter.items?.properties) {
      const problem = literalTypeProblem(value, parameter);
      if (problem) {
        problems.push(
          `${where}, parameter "${name}" ${problem} but the spec holds ${JSON.stringify(value)}`,
        );
      } else {
        checkObjectEntries(value, parameter, `${where}, parameter "${name}"`, problems);
      }
    } else {
      const problem = literalTypeProblem(value, parameter);
      if (problem) {
        problems.push(
          `${where}, parameter "${name}" ${problem} but the spec holds ${JSON.stringify(value)}`,
        );
      }
    }
  }

  for (const name of schema.required) {
    if (!supplied.some(([supplied]) => supplied === name)) {
      problems.push(`${where} requires parameter "${name}"`);
    }
  }

  const expected = trial.score?.correct_if_response_equals;
  if (expected !== undefined && typeof expected === "object") {
    checkColumn(expected.var, columns, `${where}, scoring rule`, problems);
  }
  for (const [field, value] of Object.entries(trial.record ?? {})) {
    if (isVariableReference(value)) {
      checkColumn(value.var, columns, `${where}, recorded field "${field}"`, problems);
    }
  }
}

// Entries of a list of objects (a survey's questions, say) carry their own required fields, and a
// misspelled key there would otherwise be handed to the plugin and ignored at run time.
function checkObjectEntries(
  value: ParameterValue,
  parameter: ParameterSchema,
  where: string,
  problems: string[],
) {
  const item = parameter.items;
  if (!item?.properties || !Array.isArray(value)) return;

  value.forEach((entry, index) => {
    const position = `${where}, entry ${index + 1}`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      problems.push(`${position} should be a set of fields`);
      return;
    }
    for (const name of Object.keys(entry)) {
      if (!(name in item.properties!)) problems.push(`${position} has no field "${name}"`);
    }
    for (const name of item.required ?? []) {
      if (!(name in entry)) problems.push(`${position} is missing "${name}"`);
    }
  });
}

function checkColumn(column: string, columns: Set<string>, where: string, problems: string[]) {
  if (columns.has(column)) return;
  const available = [...columns];
  problems.push(
    `${where} reads column "${column}", which no enclosing conditions table provides` +
      (available.length > 0 ? ` (available: ${available.join(", ")})` : ""),
  );
}

function checkNodes(
  nodes: SpecNode[],
  spec: Spec,
  schemas: PluginSchemas,
  columns: Set<string>,
  problems: string[],
) {
  for (const node of nodes) {
    if (node.kind !== "trial" && node.children.length === 0) {
      problems.push(`${node.kind} has no steps inside it`);
    }
    if (node.kind === "trial") {
      checkTrial(node, spec, schemas, columns, problems);
      continue;
    }
    let inner = columns;
    if (node.kind === "block") {
      if (!spec.conditions?.[node.conditions]) {
        problems.push(
          `block refers to conditions table "${node.conditions}", which the spec does not define`,
        );
      } else {
        inner = new Set([...columns, ...conditionColumns(spec, node.conditions)]);
      }
    }
    if (node.kind === "loop") {
      const tags = collectTags(node.children);
      if (!tags.includes(node.repeat_while.scope)) {
        problems.push(
          `loop repeats on tag "${node.repeat_while.scope}", but no trial inside it carries ` +
            `that tag, so it would never repeat` +
            (tags.length > 0 ? ` (tags present: ${[...new Set(tags)].join(", ")})` : ""),
        );
      }
    }
    checkNodes(node.children, spec, schemas, inner, problems);
  }
}

export function validateSpec(spec: Spec, schemas: PluginSchemas) {
  // jsPsych throws on an empty timeline, so an experiment with nothing in it is not runnable.
  const problems: string[] = spec.timeline.length === 0 ? ["the timeline has no steps"] : [];
  if (spec.data?.save === "post" && !spec.data.experiment_id) {
    problems.push("uploading data needs an experiment id from the service receiving it");
  }
  checkNodes(spec.timeline, spec, schemas, new Set(), problems);

  if (problems.length > 0) {
    throw new SpecError(
      `${spec.name}: ${problems.length} problem(s)\n  - ${problems.join("\n  - ")}`,
    );
  }
}
