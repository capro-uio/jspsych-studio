import { conditionColumns as columnsOfTable } from "@jspsych-studio/compiler";
import type { Spec, SpecNode, TrialNode } from "@jspsych-studio/compiler";

export type NodePath = number[];

const emptySpec = (): Spec => ({ name: "untitled-experiment", conditions: {}, timeline: [] });

export const project = $state({
  spec: emptySpec(),
  selection: null as NodePath | null,
});

export function childrenAt(path: NodePath): SpecNode[] {
  let nodes = project.spec.timeline;
  for (const index of path) {
    const node = nodes[index];
    if (node.kind === "trial") throw new Error("a trial has no children");
    nodes = node.children;
  }
  return nodes;
}

export function nodeAt(path: NodePath): SpecNode {
  const parent = childrenAt(path.slice(0, -1));
  return parent[path[path.length - 1]];
}

export function selectedNode(): SpecNode | null {
  return project.selection ? nodeAt(project.selection) : null;
}

export function canHoldChildren(path: NodePath) {
  return path.length === 0 || nodeAt(path).kind !== "trial";
}

export function addNode(parentPath: NodePath, node: SpecNode) {
  const siblings = childrenAt(parentPath);
  siblings.push(node);
  project.selection = [...parentPath, siblings.length - 1];
}

export function removeNode(path: NodePath) {
  childrenAt(path.slice(0, -1)).splice(path[path.length - 1], 1);
  project.selection = null;
}

export function moveNode(path: NodePath, offset: number) {
  const siblings = childrenAt(path.slice(0, -1));
  const index = path[path.length - 1];
  const target = index + offset;
  if (target < 0 || target >= siblings.length) return;
  [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
  project.selection = [...path.slice(0, -1), target];
}

export function newTrial(plugin: string): TrialNode {
  return { kind: "trial", plugin, params: {} };
}

export function newBlock(conditions: string): SpecNode {
  return { kind: "block", conditions, children: [] };
}

export function newLoop(): SpecNode {
  return { kind: "loop", repeat_while: { accuracy_below: 0.75, scope: "practice" }, children: [] };
}

export function conditionTableNames() {
  return Object.keys(project.spec.conditions ?? {});
}

export function conditionColumns(table: string) {
  return columnsOfTable(project.spec, table);
}

export function allConditionColumns() {
  return [...new Set(conditionTableNames().flatMap(conditionColumns))];
}

const NODE_KINDS = new Set(["trial", "block", "loop"]);

function assertNodes(nodes: unknown, where: string): asserts nodes is SpecNode[] {
  if (!Array.isArray(nodes)) throw new Error(`${where} must be a list of steps`);
  for (const node of nodes) {
    const kind = (node as SpecNode)?.kind;
    if (!NODE_KINDS.has(kind)) throw new Error(`${where} holds a step of unknown kind "${kind}"`);
    if (kind === "trial") {
      if (typeof (node as { plugin?: unknown }).plugin !== "string") {
        throw new Error(`${where} holds a trial with no plugin`);
      }
    } else {
      assertNodes((node as { children?: unknown }).children, `${where} › ${kind}`);
    }
  }
}

export function parseSpec(text: string): Spec {
  const parsed = JSON.parse(text) as Spec;
  if (typeof parsed?.name !== "string") throw new Error("the file has no experiment name");
  assertNodes(parsed.timeline, "timeline");
  return parsed;
}

export function loadSpec(spec: Spec) {
  project.spec = { conditions: {}, ...spec };
  project.selection = null;
}

export function exportedSpec(): Spec {
  const { name, conditions, timeline } = project.spec;
  const hasConditions = Object.keys(conditions ?? {}).length > 0;
  return hasConditions ? { name, conditions, timeline } : { name, timeline };
}
