import {
  escapeHtmlText,
  slotsOf,
  STEP_COLUMN,
  type Ending,
  type Spec,
  type SpecNode,
  type TrialNode,
} from "@tachisto/compiler";

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

/** Each step in a timeline, named by the path the builder selects it with. */
function stepPaths(nodes: SpecNode[], path: number[], into: Map<TrialNode, string>) {
  nodes.forEach((node, index) => {
    const here = [...path, index];
    if (node.kind === "trial") into.set(node, here.join("."));
    if (node.kind === "block" || node.kind === "loop") stepPaths(node.children, here, into);
    slotsOf(node)?.forEach((slot, slotIndex) =>
      stepPaths(slot.children, [...here, slotIndex], into),
    );
  });
  return into;
}

/**
 * The experiment as the preview should run it: never saving data or sending anyone back to a
 * recruitment platform, since a preview is not a participant, and optionally narrowed to one step.
 * Each step keeps the name of its place in the whole timeline, narrowed or not, so the builder can
 * point at the step the participant is on.
 */
export function tracedPreview(spec: Spec, options: PreviewOptions = {}) {
  const { data: _data, recruitment, ...rest } = spec;
  const whole = structuredClone(spec.timeline);
  const stepIds = stepPaths(whole, [], new Map());
  const timeline = options.from?.length ? trim(whole, options.from) : whole;
  drawLocally(timeline);
  const previewed: Spec = {
    ...rest,
    ...(recruitment?.endings && { recruitment: { endings: previewEndings(recruitment.endings) } }),
    timeline,
  };
  return { spec: previewed, stepIds };
}

export function previewSpec(spec: Spec, options: PreviewOptions = {}): Spec {
  return tracedPreview(spec, options).spec;
}

const MESSAGE_SOURCE = "tachisto-preview";

/** Hooks for the running study that tell the builder each time a step starts and finishes. */
export const TRACE_HOOKS =
  `on_trial_start: (trial) => { const step = trial.data?.${STEP_COLUMN}; ` +
  `if (step) window.parent.postMessage({ source: "${MESSAGE_SOURCE}", event: "start", step, ` +
  `duration: typeof trial.trial_duration === "number" ? trial.trial_duration : null }, "*"); }, ` +
  `on_trial_finish: (data) => { const step = data.${STEP_COLUMN}; ` +
  `if (step) window.parent.postMessage({ source: "${MESSAGE_SOURCE}", event: "finish", step, ` +
  `duration: null }, "*"); }`;

export interface StepEvent {
  event: "start" | "finish";
  step: string;
  /** How long the step will run, when the study knows it as the step starts. */
  duration: number | null;
}

/**
 * A message from the preview frame, if it is one the trace hooks send. The frame runs the author's
 * own code, which can post anything, so only that exact shape is read.
 */
export function readStepEvent(message: unknown): StepEvent | null {
  if (typeof message !== "object" || message === null) return null;
  const { source, event, step, duration } = message as Record<string, unknown>;
  if (source !== MESSAGE_SOURCE) return null;
  if (event !== "start" && event !== "finish") return null;
  if (typeof step !== "string" || !/^\d+(\.\d+)*$/.test(step)) return null;
  const known = typeof duration === "number" && Number.isFinite(duration) && duration >= 0;
  if (duration !== null && !known) return null;
  return { event, step, duration: known ? duration : null };
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
// preview that would pull the cursor out of whatever the builder is editing, so the frame may only
// move focus once it already has it: click into the preview and it behaves as it will for real.
export const FOCUS_GUARD = `(() => {
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (...args) {
    if (document.hasFocus()) focus.apply(this, args);
  };
})();`;
