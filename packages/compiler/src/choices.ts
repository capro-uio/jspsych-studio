import { ORDER_COLUMN, orderColumn } from "./counterbalance.ts";
import { GROUP_COLUMN, groupColumn } from "./groups.ts";
import type { AssignNode, CounterbalanceNode, SpecNode } from "./types.ts";
import { walkNodes } from "./variables.ts";

/** A step that makes one choice for each participant and records it under a column of its own. */
export type ChoiceNode = AssignNode | CounterbalanceNode;

/** The setting each kind of step names its column in, as the builder labels it. */
export const COLUMN_SETTINGS = { assign: "record group as", counterbalance: "record order as" };

function isChoiceNode(node: SpecNode): node is ChoiceNode {
  return node.kind === "assign" || node.kind === "counterbalance";
}

export function choiceColumn(node: ChoiceNode) {
  return node.kind === "assign" ? groupColumn(node) : orderColumn(node);
}

/** The column a step of this kind records under when it is given no name. */
export function usualColumn(kind: ChoiceNode["kind"]) {
  return kind === "assign" ? GROUP_COLUMN : ORDER_COLUMN;
}

export function choiceNodes(timeline: SpecNode[]): ChoiceNode[] {
  const found: ChoiceNode[] = [];
  walkNodes(timeline, (node) => {
    if (isChoiceNode(node)) found.push(node);
  });
  return found;
}

/**
 * The column a new step of this kind should record under: its usual name while no step records
 * there, otherwise the first of `group_2`, `group_3`, … that none does.
 */
export function firstFreeColumn(kind: ChoiceNode["kind"], timeline: SpecNode[]) {
  const base = usualColumn(kind);
  const taken = new Set(choiceNodes(timeline).map(choiceColumn));
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}
