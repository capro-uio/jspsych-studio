import type {
  ParameterValue,
  Slot,
  Spec,
  SpecNode,
  TrialNode,
  VariableReference,
} from "./types.ts";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isVariableReference(value: ParameterValue): value is VariableReference {
  return isPlainObject(value) && "var" in value;
}

export function conditionColumns(spec: Spec, table: string) {
  const rows = spec.conditions?.[table] ?? [];
  return [...new Set(rows.flatMap((row) => Object.keys(row)))];
}

/**
 * The child lists a node holds, when it holds more than one: a split's groups, a counterbalance's
 * tasks, a branch's paths.
 */
export function slotsOf(node: SpecNode): Slot[] | null {
  if (node.kind === "assign") return node.groups;
  if (node.kind === "counterbalance") return node.tasks;
  if (node.kind === "branch") {
    return [
      { name: "if so", children: node.then },
      { name: "otherwise", children: node.otherwise ?? [] },
    ];
  }
  return null;
}

/** The single child list a node runs in order: a block's or a loop's steps. */
export function childrenOf(node: SpecNode): SpecNode[] | null {
  return node.kind === "block" || node.kind === "loop" ? node.children : null;
}

/**
 * A step and where it sits, written as a selection is: a step's index, and a slot's index after the
 * step that holds it.
 */
export interface PlacedNode {
  node: SpecNode;
  path: number[];
}

/** Every step in a timeline, however deep, each visited before the steps inside it. */
export function walkNodes(
  timeline: SpecNode[],
  visit: (node: SpecNode, path: number[]) => void,
): void {
  const walk = (nodes: SpecNode[], path: number[]) => {
    nodes.forEach((node, index) => {
      const here = [...path, index];
      visit(node, here);
      const children = childrenOf(node);
      if (children) walk(children, here);
      slotsOf(node)?.forEach((slot, slotIndex) => walk(slot.children, [...here, slotIndex]));
    });
  };
  walk(timeline, []);
}

/**
 * The steps a path passes through, outermost first; empty if the path leads nowhere. A path may end
 * on a slot's index, which names a list rather than a step, so the last step found holds that slot.
 */
export function nodesAlongPath(timeline: SpecNode[], path: number[]): PlacedNode[] {
  const found: PlacedNode[] = [];
  let nodes = timeline;
  for (let position = 0; position < path.length; position += 1) {
    const node = nodes[path[position]];
    if (!node) return [];
    found.push({ node, path: path.slice(0, position + 1) });
    const slots = slotsOf(node);
    if (slots) {
      position += 1;
      if (position >= path.length) break;
      const slot = slots[path[position]];
      if (!slot) return [];
      nodes = slot.children;
      continue;
    }
    const children = childrenOf(node);
    if (children) nodes = children;
    else if (position < path.length - 1) return [];
  }
  return found;
}

/** Every trial in a list of steps, however deep, in the order they are written. */
export function trialsOf(nodes: SpecNode[]): TrialNode[] {
  const trials: TrialNode[] = [];
  walkNodes(nodes, (node) => {
    if (node.kind === "trial") trials.push(node);
  });
  return trials;
}
