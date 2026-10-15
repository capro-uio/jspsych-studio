import type { SchemaBundle } from "@jspsych-studio/schemas";
import { compileAppearance } from "./appearance.ts";
import { compileAssetMap, compilePreloadStep, isMediaParameter } from "./assets.ts";
import { compileAccuracyPredicate } from "./conditions.ts";
import { compileDataStep, compileParticipantProperties } from "./data.ts";
import {
  GROUP_VARIABLE,
  compileAssignmentStep,
  compileCheckpointStep,
  compileGroupGate,
} from "./groups.ts";
import { literal } from "./emit.ts";
import { isVariableReference } from "./variables.ts";
import { SpecError, validateSpec } from "./validate.ts";
import type {
  AssignNode,
  BlockNode,
  BranchNode,
  CompileResult,
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
  if (value.wrap) {
    return `() => ${literal(value.wrap)}.replace("{}", () => ${variableInsideFunction(value)})`;
  }
  if (media) return `() => asset(${variableInsideFunction(value)})`;
  return `jsPsych.timelineVariable(${literal(value.var)})`;
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
}

function compileAssign(node: AssignNode, context: CompileContext) {
  context.plugins.add("call-function");
  context.usesGroups = true;

  const step = compileAssignmentStep(node, context.spec.data);
  const gates = node.groups.map((group) => {
    const timeline = group.children.map((child) => compileNode(child, context)).join(", ");
    return compileGroupGate(node, group.name, timeline);
  });

  return [
    `{\n  type: jsPsychCallFunction,\n  async: ${step.async},\n  func: ${step.body},\n}`,
    ...gates,
  ].join(",\n");
}

function compileBranch(node: BranchNode, context: CompileContext) {
  const predicate = compileAccuracyPredicate(node.when);
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
  if (node.kind === "checkpoint") {
    context.plugins.add("call-function");
    return compileCheckpointStep(node);
  }
  return compileAssign(node, context);
}

export interface CompileOptions {
  /** Extra entries for the `initJsPsych` object, e.g. a finish hook for the preview iframe. */
  initEntries?: string;
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
  };
  const steps = spec.timeline.map((node) => compileNode(node, context));

  if (assets.length > 0) {
    const preload = compilePreloadStep(assets);
    plugins.add(preload.plugin);
    steps.unshift(preload.source);
  }
  if (spec.data) {
    const dataStep = compileDataStep(spec.data, spec.name);
    plugins.add(dataStep.plugin);
    steps.push(dataStep.source);
  }
  const timeline = steps.join(",\n");
  const packages = Object.fromEntries(
    [...plugins].map((plugin) => {
      const schema = bundle.plugins[plugin];
      if (!schema) throw new SpecError(`the schema bundle has no entry for plugin "${plugin}"`);
      return [plugin, { name: schema.package, version: schema.version }];
    }),
  );
  const source =
    `const jsPsych = initJsPsych(${initOptions(spec, options.initEntries)});\n\n` +
    (context.usesGroups ? `let ${GROUP_VARIABLE} = null;\n\n` : "") +
    (assets.length > 0 ? `${compileAssetMap(assets)}\n` : "") +
    (spec.data ? `${compileParticipantProperties()}\n` : "") +
    `jsPsych.run([\n${timeline},\n]);\n`;
  return {
    source,
    styles: compileAppearance(spec.settings),
    plugins: [...plugins],
    jspsych: bundle.jspsych,
    packages,
  };
}
