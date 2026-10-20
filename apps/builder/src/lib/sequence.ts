import { isVariableReference, slotsOf } from "@tachisto/compiler";
import type { ParameterValue, Spec, SpecNode, TrialNode } from "@tachisto/compiler";
import type { PluginSchema } from "@tachisto/schemas";

/** The shortest and longest a value can be, across the rows of a conditions table. */
export interface Span {
  min: number;
  max: number;
}

export type Timing =
  /** Ends after this long, whatever the participant does. */
  | { kind: "fixed"; ms: Span }
  /** Ends at a response, or after this long without one. */
  | { kind: "limit"; ms: Span }
  /** Waits for a response, however long it takes. */
  | { kind: "response" }
  /** Ends when the participant moves on, as from instructions or a questionnaire. */
  | { kind: "untimed" }
  /** Read from a column whose cells are not all durations. */
  | { kind: "varies"; column: string };

export type Role = "fixation" | "screen" | "stimulus" | "other" | "group" | "gap";

export interface Segment {
  /** The step's path, as the builder selects it; a gap belongs to no step. */
  path: number[] | null;
  role: Role;
  title: string;
  timing: Timing;
  /** What the participant answers with, for a step that takes a response. */
  answer?: string;
  /** How long the stimulus stays on screen, when it goes before the step ends. */
  shownFor?: Span;
  /** Its share of the strip's width: its length in milliseconds, or a stand-in for none. */
  weight: number;
}

export interface Sequence {
  path: number[];
  kind: "block" | "loop";
  segments: Segment[];
}

/** The width a step without a known length takes, as a second would. */
export const UNTIMED_WEIGHT = 1000;

type Lookup = (plugin: string) => PluginSchema | undefined;
type Row = Record<string, unknown>;

/** The nodes along a path, outermost first; empty if the path leads nowhere. */
function nodesAlong(timeline: SpecNode[], path: number[]) {
  const found: { node: SpecNode; path: number[] }[] = [];
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
    } else if (node.kind === "block" || node.kind === "loop") {
      nodes = node.children;
    } else if (position < path.length - 1) {
      return [];
    }
  }
  return found;
}

/** The rows a step reads from: those of the innermost block around it. */
function rowsFor(spec: Spec, along: { node: SpecNode }[]): Row[] {
  for (const { node } of [...along].reverse()) {
    if (node.kind === "block") return spec.conditions?.[node.conditions] ?? [];
  }
  return [];
}

function spanOf(value: ParameterValue | undefined, rows: Row[]): Span | string | null {
  if (typeof value === "number") return { min: value, max: value };
  if (value === undefined || !isVariableReference(value)) return null;
  const cells = rows.map((row) => Number(row[value.var]));
  if (cells.length === 0 || cells.some((cell) => !Number.isFinite(cell) || cell < 0)) {
    return value.var;
  }
  return { min: Math.min(...cells), max: Math.max(...cells) };
}

function answerOf(choices: ParameterValue | undefined, plugin: string) {
  if (choices === "ALL_KEYS") return "any key";
  if (choices !== undefined && isVariableReference(choices)) return `keys from ${choices.var}`;
  if (!Array.isArray(choices)) return undefined;
  const labels = choices.map(String);
  if (plugin.includes("button")) return labels.length === 1 ? "one button" : "a button";
  return labels.length <= 3 ? labels.join(" or ") : `one of ${labels.length} keys`;
}

// A plus sign with nothing around it but markup and space: a fixation cross, however it is styled.
const FIXATION = /^(?:\s|&nbsp;|<[^<>]*>)*\+(?:\s|&nbsp;|<[^<>]*>)*$/;

/** One step, as the strip shows it. */
export function segmentFor(trial: TrialNode, path: number[], rows: Row[], lookup: Lookup): Segment {
  const schema = lookup(trial.plugin);
  const properties = schema?.properties ?? {};
  const valueOf = (name: string) =>
    (trial.params?.[name] ?? properties[name]?.default) as ParameterValue | undefined;

  const choices = valueOf("choices");
  const takesResponse =
    choices !== "NO_KEYS" && ("choices" in properties || "response_ends_trial" in properties);
  const endsOnResponse = takesResponse && valueOf("response_ends_trial") !== false;

  const duration = "trial_duration" in properties ? spanOf(valueOf("trial_duration"), rows) : null;
  let timing: Timing;
  if (typeof duration === "string") timing = { kind: "varies", column: duration };
  else if (duration) timing = { kind: endsOnResponse ? "limit" : "fixed", ms: duration };
  else timing = { kind: takesResponse ? "response" : "untimed" };

  const shown = spanOf(valueOf("stimulus_duration"), rows);
  const stimulus = valueOf("stimulus");
  const isFixation = typeof stimulus === "string" && FIXATION.test(stimulus);
  const role: Role = isFixation
    ? "fixation"
    : takesResponse
      ? "stimulus"
      : timing.kind === "fixed"
        ? "screen"
        : "other";

  return {
    path,
    role,
    title: trial.tag ?? (isFixation ? "Fixation" : (schema?.title ?? trial.plugin)),
    timing,
    ...(takesResponse && { answer: answerOf(choices, trial.plugin) }),
    ...(shown && typeof shown !== "string" && { shownFor: shown }),
    weight:
      timing.kind === "fixed" || timing.kind === "limit"
        ? Math.max((timing.ms.min + timing.ms.max) / 2, 1)
        : UNTIMED_WEIGHT,
  };
}

function groupTitle(node: SpecNode) {
  const inside = (count: number) => `${count} ${count === 1 ? "step" : "steps"}`;
  if (node.kind === "block") return `Block · ${inside(node.children.length)}`;
  if (node.kind === "loop") return `Repeat · ${inside(node.children.length)}`;
  if (node.kind === "branch") return "Branch";
  if (node.kind === "assign") return "Groups";
  if (node.kind === "counterbalance") return "Tasks in turn";
  if (node.kind === "checkpoint") return `Checkpoint “${node.name}”`;
  if (node.kind === "end") return "End";
  return node.kind;
}

/**
 * The block or loop around the selection, laid out step by step, with the pause between steps
 * where the study has one. A selection outside any block or loop has no sequence to show.
 */
export function sequenceAt(spec: Spec, selection: number[] | null, lookup: Lookup) {
  if (!selection) return null;
  const along = nodesAlong(spec.timeline, selection);
  let index = along.length - 1;
  while (index >= 0 && along[index].node.kind !== "block" && along[index].node.kind !== "loop") {
    index -= 1;
  }
  if (index === -1) return null;
  const { node: container, path } = along[index];
  if (container.kind !== "block" && container.kind !== "loop") return null;

  const rows = rowsFor(spec, along.slice(0, index + 1));
  const gap = spec.settings?.default_iti ?? 0;
  const segments: Segment[] = [];
  container.children.forEach((child, childIndex) => {
    const childPath = [...path, childIndex];
    if (child.kind === "trial") {
      segments.push(segmentFor(child, childPath, rows, lookup));
      if (gap > 0) {
        segments.push({
          path: null,
          role: "gap",
          title: "Pause",
          timing: { kind: "fixed", ms: { min: gap, max: gap } },
          weight: gap,
        });
      }
    } else {
      segments.push({
        path: childPath,
        role: "group",
        title: groupTitle(child),
        timing: { kind: "untimed" },
        weight: UNTIMED_WEIGHT,
      });
    }
  });
  return { path, kind: container.kind, segments } satisfies Sequence;
}

const ms = (span: Span) =>
  span.min === span.max ? `${span.min} ms` : `${span.min}–${span.max} ms`;

/** How long a segment lasts, as the strip writes it under the segment. */
export function timingText(segment: Segment) {
  const { timing } = segment;
  if (timing.kind === "fixed") return ms(timing.ms);
  if (timing.kind === "limit") return `up to ${ms(timing.ms)}`;
  if (timing.kind === "varies") return `from ${timing.column}`;
  if (timing.kind === "response") return "until response";
  return segment.role === "group" ? "" : "until done";
}

/** Whether a running step is this segment's, or inside it. */
export function segmentHolds(segment: Segment, step: string) {
  if (!segment.path) return false;
  const own = segment.path.join(".");
  return step === own || step.startsWith(`${own}.`);
}

/** What else the strip says about a segment: how long its stimulus shows, and how it is answered. */
export function detailText(segment: Segment) {
  const shown = segment.shownFor && `shown ${ms(segment.shownFor)}`;
  return [shown, segment.answer].filter(Boolean).join(" · ");
}
