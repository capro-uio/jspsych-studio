import { conditionColumns as columnsOfTable } from "@jspsych-studio/compiler";
import type { AssignNode, Spec, SpecNode, TrialNode } from "@jspsych-studio/compiler";

export type NodePath = number[];

const emptySpec = (): Spec => ({ name: "untitled-experiment", conditions: {}, timeline: [] });

export const project = $state({
  spec: emptySpec(),
  selection: null as NodePath | null,
});

// A path walks the tree one index per level. A split consumes two: the split itself, then which
// group, because a group is not a step in its own right.
export function childrenAt(path: NodePath): SpecNode[] {
  let nodes = project.spec.timeline;
  for (let position = 0; position < path.length; position += 1) {
    const node = nodes[path[position]];
    if (node.kind === "assign") {
      position += 1;
      nodes = node.groups[path[position]].children;
    } else if (node.kind === "block" || node.kind === "loop") {
      nodes = node.children;
    } else {
      throw new Error(`a ${node.kind} cannot hold other steps`);
    }
  }
  return nodes;
}

export function nodeAt(path: NodePath): SpecNode {
  const parent = childrenAt(path.slice(0, -1));
  return parent[path[path.length - 1]];
}

// A selection can point at a group, which is a place to add steps rather than a step itself.
export function selectedNode(): SpecNode | null {
  if (!project.selection) return null;
  try {
    return nodeAt(project.selection) ?? null;
  } catch {
    return null;
  }
}

export function canHoldChildren(path: NodePath) {
  try {
    childrenAt(path);
    return true;
  } catch {
    return false;
  }
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

export function newAssign(): AssignNode {
  return {
    kind: "assign",
    method: "random",
    groups: [
      { name: "group 1", children: [] },
      { name: "group 2", children: [] },
    ],
  };
}

export function newCheckpoint(): SpecNode {
  return { kind: "checkpoint", name: "checkpoint" };
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

export function assetOptions() {
  return (project.spec.assets ?? []).map((asset) => asset.name);
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
  const { name, data, assets, conditions, timeline } = project.spec;
  const spec: Spec = { name, timeline };
  if (data) spec.data = data;
  if (assets?.length) spec.assets = assets;
  if (Object.keys(conditions ?? {}).length > 0) spec.conditions = conditions;
  return spec;
}
