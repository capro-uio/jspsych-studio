import { conditionColumns as columnsOfTable } from "@jspsych-studio/compiler";
import { slotsOf } from "@jspsych-studio/compiler";
import type { AssignNode, BranchNode, Spec, SpecNode, TrialNode } from "@jspsych-studio/compiler";

export type NodePath = number[];

const emptySpec = (): Spec => ({ name: "untitled-experiment", conditions: {}, timeline: [] });

/** Where the next step goes: which list, and the position in it. Kept apart from the selection,
 *  so clicking a step to edit it does not quietly move where new steps land. */
export interface Insertion {
  path: NodePath;
  index: number;
}

export const project = $state({
  spec: emptySpec(),
  selection: null as NodePath | null,
  insertion: { path: [], index: 0 } as Insertion,
});

// A path walks the tree one index per level. A node with several child lists — a split's groups,
// a branch's paths — consumes two: the node, then which list, since a list is not a step itself.
export function childrenAt(path: NodePath): SpecNode[] {
  let nodes = project.spec.timeline;
  for (let position = 0; position < path.length; position += 1) {
    const node = nodes[path[position]];
    const slots = slotsOf(node);
    if (slots) {
      position += 1;
      nodes = slots[path[position]].children;
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

/** Puts a step where the insertion point says, then moves the point past it and selects it. */
export function addAtInsertion(node: SpecNode) {
  const { path, index } = project.insertion;
  const siblings = childrenAt(path);
  const position = Math.min(index, siblings.length);
  siblings.splice(position, 0, node);
  project.insertion = { path, index: position + 1 };
  project.selection = [...path, position];
}

export function setInsertion(path: NodePath, index: number) {
  project.insertion = { path, index };
}

export function isInsertionAt(path: NodePath, index: number) {
  return project.insertion.index === index && project.insertion.path.join(".") === path.join(".");
}

export function removeNode(path: NodePath) {
  const parent = path.slice(0, -1);
  childrenAt(parent).splice(path[path.length - 1], 1);
  project.selection = null;
  // Keep the insertion point somewhere that still exists.
  project.insertion = { path: parent, index: childrenAt(parent).length };
}

export function moveNode(path: NodePath, offset: number) {
  const siblings = childrenAt(path.slice(0, -1));
  const index = path[path.length - 1];
  const target = index + offset;
  if (target < 0 || target >= siblings.length) return;
  [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
  project.selection = [...path.slice(0, -1), target];
}

export function newTrial(plugin: string, params: Record<string, unknown> = {}): TrialNode {
  return { kind: "trial", plugin, params: params as TrialNode["params"] };
}

// Containers arrive holding a step: an empty one is invalid the moment it is created, which reads
// as having done something wrong rather than as having started something.
export function newBlock(conditions: string, first: SpecNode): SpecNode {
  return { kind: "block", conditions, children: [first] };
}

export function newAssign(first: SpecNode, second: SpecNode): AssignNode {
  return {
    kind: "assign",
    method: "random",
    groups: [
      { name: "group 1", children: [first] },
      { name: "group 2", children: [second] },
    ],
  };
}

export function newBranch(first: SpecNode): BranchNode {
  // A branch judges trials that already happened, so it starts on one the experiment has.
  const [existing] = tagsInUse();
  return {
    kind: "branch",
    when: { scope: existing ?? "", accuracy_at_least: 0.8 },
    then: [first],
    otherwise: [],
  };
}

export function newCheckpoint(): SpecNode {
  return { kind: "checkpoint", name: "checkpoint" };
}

const PRACTICE_TAG = "practice";

export function newLoop(first: SpecNode): SpecNode {
  // The loop measures trials carrying a tag, so its own first step carries one: the relationship
  // is visible from the start instead of being discovered through an error.
  if (first.kind === "trial") first.tag = PRACTICE_TAG;
  return {
    kind: "loop",
    repeat_while: { accuracy_below: 0.75, scope: PRACTICE_TAG },
    children: [first],
  };
}

/** Tags already used earlier in the experiment, which is what a branch can judge. */
export function tagsInUse(): string[] {
  const found: string[] = [];
  const walk = (nodes: SpecNode[]) => {
    for (const node of nodes) {
      if (node.kind === "trial") {
        if (node.tag) found.push(node.tag);
      } else if (node.kind === "block" || node.kind === "loop") walk(node.children);
      else for (const slot of slotsOf(node) ?? []) walk(slot.children);
    }
  };
  walk(project.spec.timeline);
  return [...new Set(found)];
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

export function startNewProject() {
  project.spec = emptySpec();
  project.selection = null;
  project.insertion = { path: [], index: 0 };
}

export function loadSpec(spec: Spec) {
  project.spec = { conditions: {}, ...spec };
  project.selection = null;
  project.insertion = { path: [], index: spec.timeline.length };
}

export function exportedSpec(): Spec {
  const { name, authors, settings, data, assets, conditions, timeline } = project.spec;
  const spec: Spec = { name, timeline };
  const named = (authors ?? []).filter((author) => author.name.trim());
  if (named.length > 0) spec.authors = named;
  if (settings && Object.keys(settings).length > 0) spec.settings = settings;
  if (data) spec.data = data;
  if (assets?.length) spec.assets = assets;
  if (Object.keys(conditions ?? {}).length > 0) spec.conditions = conditions;
  return spec;
}
