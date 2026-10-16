import { slotsOf, type Spec, type SpecNode } from "@jspsych-studio/compiler";

/**
 * The steps leading to `path`, keeping the containers that give a step its context — a block still
 * supplies its conditions — and dropping everything beside it. A split or a branch is unwrapped to
 * the path actually taken, since the point is to see this step, not to be sent somewhere else.
 */
function trim(nodes: SpecNode[], path: number[]): SpecNode[] {
  const [index, ...rest] = path;
  const node = nodes[index];
  if (!node) return [];
  if (rest.length === 0) return [node];

  const slots = slotsOf(node);
  if (slots) {
    const [slotIndex, ...inside] = rest;
    const slot = slots[slotIndex];
    return slot ? trim(slot.children, inside) : [];
  }
  if (node.kind === "block" || node.kind === "loop") {
    return [{ ...node, children: trim(node.children, rest) }];
  }
  return [node];
}

export interface PreviewOptions {
  /** Start from this step rather than the beginning. */
  from?: number[] | null;
}

/**
 * The experiment as the preview should run it: never saving data, since a preview is not a
 * participant, and optionally narrowed to one step.
 */
export function previewSpec(spec: Spec, options: PreviewOptions = {}): Spec {
  const { data: _ignored, ...rest } = spec;
  const timeline = options.from?.length ? trim(spec.timeline, options.from) : spec.timeline;
  return { ...rest, timeline };
}
