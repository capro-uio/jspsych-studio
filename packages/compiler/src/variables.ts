import type { ParameterValue, Slot, Spec, SpecNode, VariableReference } from "./types.ts";

export function isVariableReference(value: ParameterValue): value is VariableReference {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "var" in value;
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
