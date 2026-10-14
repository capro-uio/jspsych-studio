import type { SchemaBundle } from "@jspsych-studio/schemas";
import { literal } from "./emit.ts";
import { isVariableReference } from "./variables.ts";
import { validateSpec } from "./validate.ts";
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

function parameterExpression(value: ParameterValue): string {
  if (!isVariableReference(value)) return literal(value);
  if (value.wrap) {
    return `() => ${literal(value.wrap)}.replace("{}", () => ${variableInsideFunction(value)})`;
  }
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

function compileTrial(trial: TrialNode, plugins: Set<string>) {
  plugins.add(trial.plugin);
  const entries = [`type: ${pluginIdentifier(trial.plugin)}`];
  for (const [name, value] of Object.entries(trial.params ?? {})) {
    entries.push(`${name}: ${parameterExpression(value)}`);
  }
  const data = dataExpression(trial);
  if (data) entries.push(`data: ${data}`);
  const score = scoreExpression(trial);
  if (score) entries.push(`on_finish: ${score}`);
  return `{\n${entries.map((entry) => `  ${entry},`).join("\n")}\n}`;
}

function compileBlock(block: BlockNode, spec: Spec, plugins: Set<string>) {
  const entries = [
    `timeline: [${block.children.map((child) => compileNode(child, spec, plugins)).join(", ")}]`,
    `timeline_variables: ${literal(spec.conditions?.[block.conditions] ?? [])}`,
  ];
  if (block.randomize_order) entries.push("randomize_order: true");
  if (block.repetitions) entries.push(`repetitions: ${block.repetitions}`);
  return `{\n${entries.map((entry) => `  ${entry},`).join("\n")}\n}`;
}

function compileLoop(loop: LoopNode, spec: Spec, plugins: Set<string>) {
  const { accuracy_below, scope } = loop.repeat_while;
  const condition =
    `() => {\n` +
    `    const scored = jsPsych.data.get().filter({ tag: ${literal(scope)} });\n` +
    `    return scored.count() > 0 && scored.select("correct").mean() < ${accuracy_below};\n` +
    `  }`;
  const timeline = loop.children.map((child) => compileNode(child, spec, plugins)).join(", ");
  return `{\n  timeline: [${timeline}],\n  loop_function: ${condition},\n}`;
}

function compileNode(node: SpecNode, spec: Spec, plugins: Set<string>): string {
  if (node.kind === "trial") return compileTrial(node, plugins);
  if (node.kind === "block") return compileBlock(node, spec, plugins);
  return compileLoop(node, spec, plugins);
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
  const timeline = spec.timeline.map((node) => compileNode(node, spec, plugins)).join(",\n");
  const packages = Object.fromEntries(
    [...plugins].map((plugin) => [
      plugin,
      { name: bundle.plugins[plugin].package, version: bundle.plugins[plugin].version },
    ]),
  );
  const source =
    `const jsPsych = initJsPsych(${options.initOptions ?? ""});\n\n` +
    `jsPsych.run([\n${timeline},\n]);\n`;
  return { source, plugins: [...plugins], jspsych: bundle.jspsych, packages };
}
