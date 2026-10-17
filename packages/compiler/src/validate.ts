import type { ParameterSchema, PluginSchemas, Variants } from "@jspsych-studio/schemas";
import type {
  AssignNode,
  BranchNode,
  CounterbalanceNode,
  ParameterValue,
  Spec,
  SpecNode,
  TrialNode,
} from "./types.ts";
import { assetNames, isMediaParameter, isMediaType } from "./assets.ts";
import { ORDER_SEPARATOR, TASK_VARIABLE, orderColumn } from "./counterbalance.ts";
import { accuracyComparison, isResponseRule } from "./conditions.ts";
import { recruitmentProblems } from "./recruitment.ts";
import { conditionColumns, isVariableReference, slotsOf } from "./variables.ts";

/** Where a problem is, as a path of indices through the timeline; absent when it is the whole spec. */
export interface Problem {
  message: string;
  path?: number[];
}

export class SpecError extends Error {
  readonly problems: Problem[];

  constructor(name: string, problems: Problem[]) {
    super(
      `${name}: ${problems.length} problem(s)\n  - ${problems.map((p) => p.message).join("\n  - ")}`,
    );
    this.problems = problems;
  }
}

const RECIPE_SUPPLIED_PARAMETERS = new Set(["data", "on_finish"]);

function collectTags(nodes: SpecNode[]): string[] {
  return nodes.flatMap((node) => {
    if (node.kind === "trial") return node.tag ? [node.tag] : [];
    if (node.kind === "block" || node.kind === "loop") return collectTags(node.children);
    const slots = slotsOf(node);
    return slots ? slots.flatMap((slot) => collectTags(slot.children)) : [];
  });
}

const KEY_LIST_KEYWORDS = new Set(["ALL_KEYS", "NO_KEYS"]);

// Only the types the extractor resolved unambiguously. A KEYS parameter is a list that also
// accepts the strings "ALL_KEYS" and "NO_KEYS", so it is checked on its own terms.
function literalTypeProblem(value: ParameterValue, parameter: ParameterSchema) {
  if (parameter.enum && !parameter.enum.includes(value)) {
    return `expects one of ${parameter.enum.map((option) => JSON.stringify(option)).join(", ")}`;
  }
  if (parameter.type === "array") {
    if (Array.isArray(value)) {
      const options = parameter.items?.enum;
      if (!options || value.every((entry) => options.includes(entry))) return null;
      return `expects each entry to be one of ${options.map((option) => JSON.stringify(option)).join(", ")}`;
    }
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
  problems: Problem[],
  path: number[],
) {
  const report = (message: string) => problems.push({ message, path });
  const assets = assetNames(spec.assets);
  const schema = schemas[trial.plugin];
  if (!schema) {
    report(`unknown plugin "${trial.plugin}"`);
    return;
  }

  const where = `plugin "${trial.plugin}"`;
  const supplied = Object.entries(trial.params ?? {});

  for (const [name, value] of supplied) {
    const parameter = schema.properties[name];
    if (!parameter && !RECIPE_SUPPLIED_PARAMETERS.has(name)) {
      report(`${where} has no parameter "${name}"`);
      continue;
    }
    if (!parameter) continue;
    if (isVariableReference(value)) {
      checkColumn(value.var, columns, `${where}, parameter "${name}"`, problems, path);
    } else if (isMediaParameter(trial.plugin, name, parameter.jspsychType)) {
      checkFiles(value, assets, `${where}, parameter "${name}"`, report);
    } else if (parameter.items?.properties) {
      const problem = literalTypeProblem(value, parameter);
      if (problem) {
        report(
          `${where}, parameter "${name}" ${problem} but the spec holds ${JSON.stringify(value)}`,
        );
      } else {
        checkObjectEntries(value, parameter, `${where}, parameter "${name}"`, {
          columns,
          assets,
          problems,
          path,
        });
      }
    } else {
      const problem = literalTypeProblem(value, parameter);
      if (problem) {
        report(
          `${where}, parameter "${name}" ${problem} but the spec holds ${JSON.stringify(value)}`,
        );
      }
    }
  }

  for (const name of schema.required) {
    if (!supplied.some(([supplied]) => supplied === name)) {
      report(`${where} requires parameter "${name}"`);
    }
  }

  const expected = trial.score?.correct_if_response_equals;
  if (expected !== undefined && typeof expected === "object") {
    checkColumn(expected.var, columns, `${where}, scoring rule`, problems, path);
  }
  for (const [field, value] of Object.entries(trial.record ?? {})) {
    if (isVariableReference(value)) {
      checkColumn(value.var, columns, `${where}, recorded field "${field}"`, problems, path);
    }
  }
}

function checkFiles(
  value: ParameterValue,
  assets: Set<string>,
  where: string,
  report: (message: string) => void,
) {
  const named = (Array.isArray(value) ? value : [value]).filter(
    (entry): entry is string => typeof entry === "string" && entry !== "",
  );
  for (const entry of named) {
    if (assets.has(entry) || looksLikePath(entry)) continue;
    report(
      `${where} names "${entry}", which is neither an added file nor a path` +
        (assets.size > 0 ? ` (files added: ${[...assets].join(", ")})` : ""),
    );
  }
}

interface EntryContext {
  columns: Set<string>;
  assets: Set<string>;
  problems: Problem[];
  path: number[];
}

// A variant's rules mirror the checks its plugin makes when the trial starts, which it reports
// with a blocking alert in front of the participant rather than an error.
function checkVariant(
  entry: Record<string, unknown>,
  variants: Variants,
  position: string,
  report: (message: string) => void,
) {
  const chosen = entry[variants.by];
  if (typeof chosen !== "string") return;
  const variant = variants.options[chosen];
  if (!variant) return;
  const list = (names: string[]) => names.map((name) => `"${name}"`).join(", ");
  for (const name of variant.required) {
    if (!(name in entry)) report(`${position} (${chosen}) needs "${name}"`);
  }
  for (const group of variant.any_of ?? []) {
    if (!group.some((name) => name in entry)) {
      report(`${position} (${chosen}) needs one of ${list(group)}`);
    }
  }
  for (const group of variant.at_most_one_of ?? []) {
    if (group.filter((name) => name in entry).length > 1) {
      report(`${position} (${chosen}) takes only one of ${list(group)}`);
    }
  }
}

// Entries of a list of objects (a survey's questions, say) carry their own required fields, and a
// misspelled key there would otherwise be handed to the plugin and ignored at run time.
function checkObjectEntries(
  value: ParameterValue,
  parameter: ParameterSchema,
  where: string,
  context: EntryContext,
) {
  const report = (message: string) => context.problems.push({ message, path: context.path });
  const item = parameter.items;
  if (!item?.properties || !Array.isArray(value)) return;
  const fields = item.properties;

  value.forEach((entry, index) => {
    const position = `${where}, entry ${index + 1}`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      report(`${position} should be a set of fields`);
      return;
    }
    const fieldSet = entry as Record<string, ParameterValue>;
    for (const [name, field] of Object.entries(fieldSet)) {
      const schema = fields[name];
      if (!schema) {
        report(`${position} has no field "${name}"`);
      } else if (isVariableReference(field)) {
        checkColumn(
          field.var,
          context.columns,
          `${position}, field "${name}"`,
          context.problems,
          context.path,
        );
      } else if (isMediaType(schema.jspsychType)) {
        checkFiles(field, context.assets, `${position}, field "${name}"`, report);
      } else {
        const problem = literalTypeProblem(field, schema);
        if (problem) {
          report(
            `${position}, field "${name}" ${problem} but the spec holds ${JSON.stringify(field)}`,
          );
        }
      }
    }
    for (const name of item.required ?? []) {
      if (!(name in fieldSet)) report(`${position} is missing "${name}"`);
    }
    if (item.variants) checkVariant(fieldSet, item.variants, position, report);
  });
}

function checkAssign(node: AssignNode, spec: Spec, problems: Problem[], path: number[]) {
  const report = (message: string) => problems.push({ message, path });
  if (node.groups.length < 2) {
    report("splitting participants needs at least two groups");
  }
  const names = node.groups.map((group) => group.name);
  if (names.some((name) => !name)) report("every group needs a name");
  if (new Set(names).size !== names.length) report("group names must be different");
  for (const group of node.groups) {
    if (group.children.length === 0) report(`group "${group.name}" has no steps inside it`);
  }
  if (node.method === "balanced" && !(spec.data?.save === "post" && spec.data.experiment_id)) {
    report("balanced groups need data uploading to a service, which is what keeps the count");
  }
}

function collectOrderColumns(nodes: SpecNode[]): string[] {
  return nodes.flatMap((node) => {
    const own = node.kind === "counterbalance" ? [orderColumn(node)] : [];
    if (node.kind === "block" || node.kind === "loop") return collectOrderColumns(node.children);
    const slots = slotsOf(node) ?? [];
    return [...own, ...slots.flatMap((slot) => collectOrderColumns(slot.children))];
  });
}

function checkCounterbalance(
  node: CounterbalanceNode,
  spec: Spec,
  columns: Set<string>,
  problems: Problem[],
  path: number[],
) {
  const report = (message: string) => problems.push({ message, path });
  if (node.tasks.length < 2) report("counterbalancing needs at least two tasks");
  const names = node.tasks.map((task) => task.name);
  if (names.some((name) => !name)) report("every task needs a name");
  if (new Set(names).size !== names.length) report("task names must be different");
  // The order is recorded as the names joined by the separator, so a name holding it would make
  // the recorded order impossible to read back.
  for (const name of names.filter((name) => name.includes(ORDER_SEPARATOR))) {
    report(
      `task "${name}" contains "${ORDER_SEPARATOR}", which the recorded order uses between tasks`,
    );
  }
  if (columns.has(TASK_VARIABLE)) {
    report(
      `an enclosing conditions table has a column named "${TASK_VARIABLE}", which the ` +
        "counterbalanced step uses itself: rename that column",
    );
  }
  for (const task of node.tasks) {
    if (task.children.length === 0) report(`task "${task.name}" has no steps inside it`);
  }
  if (node.method === "latin_square" && !(spec.data?.save === "post" && spec.data.experiment_id)) {
    report(
      "a Latin-square order needs data uploading to a service, which is what counts " +
        "participants; when data is downloaded, only random order is available",
    );
  }
  const column = orderColumn(node);
  if (collectOrderColumns(spec.timeline).filter((other) => other === column).length > 1) {
    report(
      `another counterbalanced step also records its order as "${column}", so one would ` +
        "overwrite the other: give each its own column name",
    );
  }
}

const ANSWER_TYPES = new Set(["string", "number", "boolean"]);

// The compiler never runs the JSON Schema, so a hand-edited rule reaches this unfiltered.
function branchRuleProblem(rule: BranchNode["when"]) {
  if (!isResponseRule(rule)) {
    return rule.accuracy_below !== undefined && rule.accuracy_at_least !== undefined
      ? "a branch compares accuracy one way, not both at once"
      : null;
  }
  if ("accuracy_below" in rule || "accuracy_at_least" in rule) {
    return "a branch decides on accuracy or on an answer, not both at once";
  }
  if (!ANSWER_TYPES.has(typeof rule.response_equals) || rule.response_equals === "") {
    return "a branch deciding on an answer needs the answer it looks for";
  }
  if (rule.question !== undefined && (typeof rule.question !== "string" || !rule.question)) {
    return "a branch reading one question of a survey needs that question's name";
  }
  return null;
}

function checkBranch(node: BranchNode, spec: Spec, problems: Problem[], path: number[]) {
  const report = (message: string) => problems.push({ message, path });
  if (node.then.length === 0 && (node.otherwise ?? []).length === 0) {
    report("a branch needs steps on at least one of its paths");
  }
  const ruleProblem = branchRuleProblem(node.when);
  if (ruleProblem) report(ruleProblem);
  // The trials being judged have to have happened already, so they cannot live inside the branch.
  const earlier = new Set(collectTags(spec.timeline).filter(Boolean));
  const inside = new Set(collectTags(slotsOf(node)?.flatMap((slot) => slot.children) ?? []));
  const available = [...earlier].filter((tag) => !inside.has(tag));
  if (!node.when.scope) {
    report(
      "a branch needs to know which trials it judges: tag them, then name that tag here" +
        (available.length > 0 ? ` (tags available: ${available.join(", ")})` : ""),
    );
  } else if (!available.includes(node.when.scope)) {
    report(
      `a branch judges "${node.when.scope}", but no trial before it carries that tag` +
        (available.length > 0 ? ` (tags available: ${available.join(", ")})` : ""),
    );
  }
}

function checkColumn(
  column: string,
  columns: Set<string>,
  where: string,
  problems: Problem[],
  path: number[],
) {
  const report = (message: string) => problems.push({ message, path });
  if (columns.has(column)) return;
  const available = [...columns];
  report(
    `${where} reads column "${column}", which no enclosing conditions table provides` +
      (available.length > 0 ? ` (available: ${available.join(", ")})` : ""),
  );
}

function checkNodes(
  nodes: SpecNode[],
  spec: Spec,
  schemas: PluginSchemas,
  columns: Set<string>,
  problems: Problem[],
  path: number[],
) {
  nodes.forEach((node, index) => {
    const here = [...path, index];
    const report = (message: string) => problems.push({ message, path: here });

    if (node.kind === "checkpoint") {
      if (!node.name) report("a checkpoint needs a name");
      return;
    }
    if (node.kind === "assign" || node.kind === "counterbalance" || node.kind === "branch") {
      if (node.kind === "assign") checkAssign(node, spec, problems, here);
      else if (node.kind === "counterbalance")
        checkCounterbalance(node, spec, columns, problems, here);
      else checkBranch(node, spec, problems, here);
      (slotsOf(node) ?? []).forEach((slot, slotIndex) => {
        checkNodes(slot.children, spec, schemas, columns, problems, [...here, slotIndex]);
      });
      return;
    }
    if (node.kind === "trial") {
      checkTrial(node, spec, schemas, columns, problems, here);
      return;
    }

    if (node.children.length === 0) report(`${node.kind} has no steps inside it`);

    let inner = columns;
    if (node.kind === "block") {
      if (!spec.conditions?.[node.conditions]) {
        report(
          `block refers to conditions table "${node.conditions}", which the spec does not define`,
        );
      } else {
        inner = new Set([...columns, ...conditionColumns(spec, node.conditions)]);
      }
    }
    if (node.kind === "loop") {
      accuracyComparison(node.repeat_while);
      const tags = collectTags(node.children);
      if (!tags.includes(node.repeat_while.scope)) {
        report(
          `loop repeats on tag "${node.repeat_while.scope}", but no trial inside it carries ` +
            `that tag, so it would never repeat` +
            (tags.length > 0 ? ` (tags present: ${[...new Set(tags)].join(", ")})` : ""),
        );
      }
    }
    checkNodes(node.children, spec, schemas, inner, problems, here);
  });
}

export function validateSpec(spec: Spec, schemas: PluginSchemas) {
  // jsPsych throws on an empty timeline, so an experiment with nothing in it is not runnable.
  const problems: Problem[] =
    spec.timeline.length === 0 ? [{ message: "the timeline has no steps" }] : [];
  if (spec.data?.save === "post" && !spec.data.experiment_id) {
    problems.push({
      message: "uploading data needs an experiment id from the service receiving it",
    });
  }
  problems.push(...recruitmentProblems(spec));
  checkNodes(spec.timeline, spec, schemas, new Set(), problems, []);

  if (problems.length > 0) throw new SpecError(spec.name, problems);
}
