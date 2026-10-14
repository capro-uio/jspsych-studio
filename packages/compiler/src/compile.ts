import type { SchemaBundle } from "@jspsych-studio/schemas";
import { compileAssetMap, compilePreloadStep } from "./assets.ts";
import { compileDataStep, compileParticipantProperties } from "./data.ts";
import { literal } from "./emit.ts";
import { isVariableReference } from "./variables.ts";
import { SpecError, validateSpec } from "./validate.ts";
import type {
  BlockNode,
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
const MEDIA_TYPES = new Set(["IMAGE", "AUDIO", "VIDEO"]);

function parameterExpression(value: ParameterValue, media = false): string {
  if (!isVariableReference(value)) {
    return media ? `asset(${literal(value)})` : literal(value);
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
    const media = context.hasAssets && MEDIA_TYPES.has(properties[name]?.jspsychType);
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
  const { accuracy_below, scope } = loop.repeat_while;
  const condition =
    `() => {\n` +
    `    const scored = jsPsych.data.get().filter({ tag: ${literal(scope)} });\n` +
    `    return scored.count() > 0 && scored.select("correct").mean() < ${accuracy_below};\n` +
    `  }`;
  const timeline = loop.children.map((child) => compileNode(child, context)).join(", ");
  return `{\n  timeline: [${timeline}],\n  loop_function: ${condition},\n}`;
}

interface CompileContext {
  spec: Spec;
  bundle: SchemaBundle;
  plugins: Set<string>;
  hasAssets: boolean;
}

function compileNode(node: SpecNode, context: CompileContext): string {
  if (node.kind === "trial") return compileTrial(node, context);
  if (node.kind === "block") return compileBlock(node, context);
  return compileLoop(node, context);
}

export interface CompileOptions {
  /** JavaScript passed verbatim to `initJsPsych`, e.g. a finish hook for the preview iframe. */
  initOptions?: string;
}

export function compileSpec(
  spec: Spec,
  bundle: SchemaBundle,
  options: CompileOptions = {},
): CompileResult {
  validateSpec(spec, bundle.plugins);
  const plugins = new Set<string>();
  const assets = spec.assets ?? [];
  const context: CompileContext = { spec, bundle, plugins, hasAssets: assets.length > 0 };
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
    `const jsPsych = initJsPsych(${options.initOptions ?? ""});\n\n` +
    (assets.length > 0 ? `${compileAssetMap(assets)}\n` : "") +
    (spec.data ? `${compileParticipantProperties()}\n` : "") +
    `jsPsych.run([\n${timeline},\n]);\n`;
  return { source, plugins: [...plugins], jspsych: bundle.jspsych, packages };
}
