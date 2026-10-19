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

/** Every trial in a list of steps, however deep, in the order they are written. */
export function trialsOf(nodes: SpecNode[]): TrialNode[] {
  return nodes.flatMap((node): TrialNode[] => {
    if (node.kind === "trial") return [node];
    const children = childrenOf(node);
    if (children) return trialsOf(children);
    return (slotsOf(node) ?? []).flatMap((slot) => trialsOf(slot.children));
  });
}
