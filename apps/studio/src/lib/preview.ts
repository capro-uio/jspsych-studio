import {
  escapeHtmlText,
  slotsOf,
  type Ending,
  type Spec,
  type SpecNode,
} from "@jspsych-studio/compiler";

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

/**
 * A preview is not a participant, so it must not take a place in the data service's count: groups
 * and orders the service would hand out are drawn in the browser instead.
 */
function drawLocally(nodes: SpecNode[]) {
  for (const node of nodes) {
    if (node.kind === "assign" || node.kind === "counterbalance") node.method = "random";
    if (node.kind === "block" || node.kind === "loop") drawLocally(node.children);
    for (const slot of slotsOf(node) ?? []) drawLocally(slot.children);
  }
}

export interface PreviewOptions {
  /** Start from this step rather than the beginning. */
  from?: number[] | null;
}

/**
 * The experiment as the preview should run it: never saving data or sending anyone back to a
 * recruitment platform, since a preview is not a participant, and optionally narrowed to one step.
 */
export function previewSpec(spec: Spec, options: PreviewOptions = {}): Spec {
  const { data: _data, recruitment, ...rest } = spec;
  const timeline = structuredClone(
    options.from?.length ? trim(spec.timeline, options.from) : spec.timeline,
  );
  drawLocally(timeline);
  return {
    ...rest,
    ...(recruitment?.endings && { recruitment: { endings: previewEndings(recruitment.endings) } }),
    timeline,
  };
}

// An end step has to reach an ending that exists, so the preview keeps every ending, saying where
// a participant would be sent instead of sending them.
function previewEndings(endings: Record<string, Ending>) {
  return Object.fromEntries(
    Object.entries(endings).map(([name, ending]) => [
      name,
      ending.url === undefined
        ? ending
        : { message: `<p>Here the participant is sent to ${escapeHtmlText(ending.url)}</p>` },
    ]),
  );
}

// jsPsych focuses its display at the start of every trial so keypresses reach it. Inside the
// preview that would pull the cursor out of whatever the studio is editing, so the frame may only
// move focus once it already has it: click into the preview and it behaves as it will for real.
export const FOCUS_GUARD = `(() => {
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (...args) {
    if (document.hasFocus()) focus.apply(this, args);
  };
})();`;
