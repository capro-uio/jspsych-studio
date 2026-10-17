import type { ParameterSchema, SchemaBundle } from "@jspsych-studio/schemas";
import { compileAppearance } from "./appearance.ts";
import { compileAssetMap, compilePreloadStep, isMediaParameter, isMediaType } from "./assets.ts";
import { compileAccuracyPredicate, compileBranchPredicate } from "./conditions.ts";
import { compileParticipantProperties } from "./data.ts";
import { compileCompletion, compileEndStep } from "./endings.ts";
import { reservedLinkColumns } from "./metadata.ts";
import { idParamOf, needsParticipantId } from "./recruitment.ts";
import {
  GROUP_VARIABLE,
  compileAssignmentStep,
  compileCheckpointStep,
  compileGroupGate,
} from "./groups.ts";
import { literal } from "./emit.ts";
import {
  ORDERS_VARIABLE,
  compileCounterbalancedTasks,
  compileOrderStep,
} from "./counterbalance.ts";
import { isVariableReference } from "./variables.ts";
import { SpecError, validateSpec } from "./validate.ts";
import type {
  AssignNode,
  BlockNode,
  BranchNode,
  CompileResult,
  CounterbalanceNode,
  LoopNode,
  ParameterValue,
  Spec,
  SpecNode,
  TrialNode,
  VariableReference,
} from "./types.ts";

export function pluginIdentifier(plugin: string) {
  const camelCased = plugin
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
  return `jsPsych${camelCased}`;
}

// Inside a function body a timeline variable must be read with evaluateTimelineVariable:
// jsPsych.timelineVariable() returns a placeholder object there, which renders as [object Object].
function variableInsideFunction(reference: VariableReference) {
  return `jsPsych.evaluateTimelineVariable(${literal(reference.var)})`;
}

// Media parameters resolve through the asset map, so a spec can name a file rather than carry a
// data URL in every parameter and every conditions cell.
function parameterExpression(value: ParameterValue, media = false): string {
  if (!isVariableReference(value)) {
    if (!media) return literal(value);
    if (Array.isArray(value)) {
      return `[${value.map((entry) => `asset(${literal(entry)})`).join(", ")}]`;
    }
    return `asset(${literal(value)})`;
  }
  if (value.wrap || media) return `() => ${valueInsideFunction(value, media)}`;
  return `jsPsych.timelineVariable(${literal(value.var)})`;
}

function valueInsideFunction(value: ParameterValue, media: boolean): string {
  if (!isVariableReference(value)) return media ? `asset(${literal(value)})` : literal(value);
  const read = variableInsideFunction(value);
  if (value.wrap) return `${literal(value.wrap)}.replace("{}", () => ${read})`;
  return media ? `asset(${read})` : read;
}

function isFieldSet(entry: unknown): entry is Record<string, ParameterValue> {
  return typeof entry === "object" && entry !== null && !Array.isArray(entry);
}

// jsPsych resolves timeline variables inside a list's entries only for the fields a plugin
// declares, and the psychophysics plugin declares few of an object's fields. A list holding any
// bound field is therefore built by a function when the trial starts, reading each column itself.
function entriesExpression(entries: unknown[], item: ParameterSchema, hasAssets: boolean) {
  const isMediaField = (name: string) =>
    hasAssets && isMediaType(item.properties?.[name]?.jspsychType);
  const fieldSets = entries.filter(isFieldSet);
  const bound = fieldSets.some((entry) => Object.values(entry).some(isVariableReference));
  const named = fieldSets.some((entry) => Object.keys(entry).some(isMediaField));
  if (!bound && !named) return literal(entries);

  const compiled = entries.map((entry) => {
    if (!isFieldSet(entry)) return literal(entry);
    const fields = Object.entries(entry).map(
      ([name, value]) => `${literal(name)}: ${valueInsideFunction(value, isMediaField(name))}`,
    );
    return `{ ${fields.join(", ")} }`;
  });
  const list = `[${compiled.join(", ")}]`;
  return bound ? `() => ${list}` : list;
}

function dataExpression(trial: TrialNode) {
  const entries = [
    ...(trial.tag ? [`tag: ${literal(trial.tag)}`] : []),
    ...Object.entries(trial.record ?? {}).map(
      ([key, value]) => `${key}: ${parameterExpression(value)}`,
    ),
  ];
  return entries.length > 0 ? `{ ${entries.join(", ")} }` : null;
}

function scoreExpression(trial: TrialNode) {
  const expected = trial.score?.correct_if_response_equals;
  if (expected === undefined) return null;
  const comparison =
    typeof expected === "object" ? variableInsideFunction(expected) : literal(expected);
  return `(data) => { data.correct = data.response === ${comparison}; }`;
}

function compileTrial(trial: TrialNode, context: CompileContext) {
  context.plugins.add(trial.plugin);
  const properties = context.bundle.plugins[trial.plugin]?.properties ?? {};
  const entries = [`type: ${pluginIdentifier(trial.plugin)}`];
  for (const [name, value] of Object.entries(trial.params ?? {})) {
    const item = properties[name]?.items;
    if (item?.properties && Array.isArray(value)) {
      entries.push(`${name}: ${entriesExpression(value, item, context.hasAssets)}`);
      continue;
    }
    const media =
      context.hasAssets && isMediaParameter(trial.plugin, name, properties[name]?.jspsychType);
    entries.push(`${name}: ${parameterExpression(value, media)}`);
  }
  const data = dataExpression(trial);
  if (data) entries.push(`data: ${data}`);
  const score = scoreExpression(trial);
  if (score) entries.push(`on_finish: ${score}`);
  return `{\n${entries.map((entry) => `  ${entry},`).join("\n")}\n}`;
}

function compileBlock(block: BlockNode, context: CompileContext) {
  const entries = [
    `timeline: [${block.children.map((child) => compileNode(child, context)).join(", ")}]`,
    `timeline_variables: ${literal(context.spec.conditions?.[block.conditions] ?? [])}`,
  ];
  if (block.randomize_order) entries.push("randomize_order: true");
  if (block.repetitions) entries.push(`repetitions: ${block.repetitions}`);
  return `{\n${entries.map((entry) => `  ${entry},`).join("\n")}\n}`;
}

function compileLoop(loop: LoopNode, context: CompileContext) {
  const timeline = loop.children.map((child) => compileNode(child, context)).join(", ");
  const condition = compileAccuracyPredicate(loop.repeat_while);
  return `{
  timeline: [${timeline}],
  loop_function: ${condition},
}`;
}

interface CompileContext {
  spec: Spec;
  bundle: SchemaBundle;
  plugins: Set<string>;
  hasAssets: boolean;
  usesGroups: boolean;
  usesCounterbalance: boolean;
}

function callFunctionStep(step: { async: boolean; body: string }) {
  return `{\n  type: jsPsychCallFunction,\n  async: ${step.async},\n  func: ${step.body},\n}`;
}

function compileAssign(node: AssignNode, context: CompileContext) {
  context.plugins.add("call-function");
  context.usesGroups = true;

  const step = compileAssignmentStep(node, context.spec.data);
  const gates = node.groups.map((group) => {
    const timeline = group.children.map((child) => compileNode(child, context)).join(", ");
    return compileGroupGate(node, group.name, timeline);
  });

  return [callFunctionStep(step), ...gates].join(",\n");
}

function compileCounterbalance(node: CounterbalanceNode, context: CompileContext) {
  context.plugins.add("call-function");
  context.usesCounterbalance = true;

  const step = compileOrderStep(node, context.spec.data);
  const timelines = node.tasks.map((task) =>
    task.children.map((child) => compileNode(child, context)).join(", "),
  );

  return [callFunctionStep(step), compileCounterbalancedTasks(node, timelines)].join(",\n");
}

function compileBranch(node: BranchNode, context: CompileContext) {
  const predicate = compileBranchPredicate(node.when);
  const paths: string[] = [];
  const gate = (children: SpecNode[], taken: boolean) => {
    if (children.length === 0) return;
    const timeline = children.map((child) => compileNode(child, context)).join(", ");
    const test = taken ? `(${predicate})()` : `!(${predicate})()`;
    paths.push(`{\n  timeline: [${timeline}],\n  conditional_function: () => ${test},\n}`);
  };
  gate(node.then, true);
  gate(node.otherwise ?? [], false);
  return paths.join(",\n");
}

function compileNode(node: SpecNode, context: CompileContext): string {
  if (node.kind === "trial") return compileTrial(node, context);
  if (node.kind === "block") return compileBlock(node, context);
  if (node.kind === "loop") return compileLoop(node, context);
  if (node.kind === "branch") return compileBranch(node, context);
  if (node.kind === "counterbalance") return compileCounterbalance(node, context);
  if (node.kind === "checkpoint") {
    context.plugins.add("call-function");
    return compileCheckpointStep(node);
  }
  if (node.kind === "end") {
    const step = compileEndStep(node, context.spec);
    context.plugins.add(step.plugin);
    return step.source;
  }
  return compileAssign(node, context);
}

export interface CompileOptions {
  /** Extra entries for the `initJsPsych` object, e.g. a finish hook for the preview iframe. */
  initEntries?: string;
  /** `"inline"` embeds media in the page; `"files"` points at files beside it. */
  assets?: "inline" | "files";
}

const SETTING_KEYS = [
  "default_iti",
  "minimum_valid_rt",
  "show_progress_bar",
  "progress_bar_message",
] as const;

function initOptions(spec: Spec, extra: string | undefined) {
  const entries = SETTING_KEYS.filter((key) => spec.settings?.[key] !== undefined).map(
    (key) => `${key}: ${literal(spec.settings![key])}`,
  );
  if (extra) entries.push(extra);
  return entries.length > 0 ? `{ ${entries.join(", ")} }` : "";
}

export function compileSpec(
  spec: Spec,
  bundle: SchemaBundle,
  options: CompileOptions = {},
): CompileResult {
  validateSpec(spec, bundle.plugins);
  const plugins = new Set<string>();
  const assets = spec.assets ?? [];
  const context: CompileContext = {
    spec,
    bundle,
    plugins,
    hasAssets: assets.length > 0,
    usesGroups: false,
    usesCounterbalance: false,
  };
  const steps = spec.timeline.map((node) => compileNode(node, context));

  const preload = compilePreloadStep(assets);
  if (preload) {
    plugins.add(preload.plugin);
    steps.unshift(preload.source);
  }
  const completion = compileCompletion(spec);
  if (completion) {
    plugins.add(completion.plugin);
    steps.push(completion.source);
  }
  const timeline = steps.join(",\n");
  const packages = Object.fromEntries(
    [...plugins].map((plugin) => {
      const schema = bundle.plugins[plugin];
      if (!schema) {
        throw new SpecError(spec.name, [
          { message: `the schema bundle has no entry for plugin "${plugin}"` },
        ]);
      }
      return [plugin, { name: schema.package, version: schema.version }];
    }),
  );
  const source =
    `const jsPsych = initJsPsych(${initOptions(spec, options.initEntries)});\n\n` +
    (context.usesGroups ? `let ${GROUP_VARIABLE} = null;\n\n` : "") +
    (context.usesCounterbalance ? `const ${ORDERS_VARIABLE} = {};\n\n` : "") +
    (assets.length > 0 ? `${compileAssetMap(assets, options.assets ?? "inline")}\n` : "") +
    (needsParticipantId(spec)
      ? `${compileParticipantProperties({
          experimentName: spec.name,
          idParam: idParamOf(spec.recruitment),
          reserved: reservedLinkColumns(spec),
          pluginIdentifiers: [...plugins].map(pluginIdentifier),
        })}\n`
      : "") +
    `jsPsych.run([\n${timeline},\n]);\n`;
  return {
    source,
    styles: compileAppearance(spec.settings),
    plugins: [...plugins],
    jspsych: bundle.jspsych,
    packages,
  };
}
