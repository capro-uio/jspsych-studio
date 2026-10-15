export interface VariableReference {
  var: string;
  wrap?: string;
}

export type ParameterValue = VariableReference | string | number | boolean | null | unknown[];

export interface CorrectIfRule {
  correct_if_response_equals: VariableReference | string | number;
}

export interface AccuracyRule {
  /** The tag whose trials are measured. */
  scope: string;
  accuracy_below?: number;
  accuracy_at_least?: number;
}

export interface TrialNode {
  kind: "trial";
  plugin: string;
  tag?: string;
  params?: Record<string, ParameterValue>;
  record?: Record<string, ParameterValue>;
  score?: CorrectIfRule;
}

export interface BlockNode {
  kind: "block";
  conditions: string;
  randomize_order?: boolean;
  repetitions?: number;
  children: SpecNode[];
}

export interface Group {
  name: string;
  children: SpecNode[];
}

/** Splits participants between groups: a between-subjects manipulation. */
export interface AssignNode {
  kind: "assign";
  /** `"random"` decides in the browser; `"balanced"` asks the data service for the next group. */
  method: "random" | "balanced";
  /** Column name the chosen group is recorded under. */
  record_as?: string;
  groups: Group[];
}

/** Sends a participant down one of two paths depending on how they did. */
export interface BranchNode {
  kind: "branch";
  when: AccuracyRule;
  then: SpecNode[];
  otherwise?: SpecNode[];
}

/** Records that a participant reached a point in the study, for drop-out analysis. */
export interface CheckpointNode {
  kind: "checkpoint";
  name: string;
}

export interface LoopNode {
  kind: "loop";
  id?: string;
  repeat_while: AccuracyRule;
  children: SpecNode[];
}

export type SpecNode = TrialNode | BlockNode | LoopNode | AssignNode | BranchNode | CheckpointNode;

/** A named list of steps inside a node, such as a group or a branch's path. */
export interface Slot {
  name: string;
  children: SpecNode[];
}

export interface DataSettings {
  /** `"download"` saves a CSV on the participant's machine, `"post"` uploads it. */
  save: "download" | "post";
  /** Upload target; defaults to DataPipe. */
  endpoint?: string;
  /** The experiment id the endpoint files the data under. */
  experiment_id?: string;
  filename_prefix?: string;
}

export interface Asset {
  /** The name the spec refers to this file by, e.g. "face.png". */
  name: string;
  /** A data URL holding the file, so a project and its export stay self-contained. */
  url: string;
}

/** Settings that apply to the whole experiment rather than to one step. */
export interface ExperimentSettings {
  /** Gap in milliseconds after every trial, unless a step sets its own. */
  default_iti?: number;
  /** Responses faster than this are ignored, in milliseconds. */
  minimum_valid_rt?: number;
  show_progress_bar?: boolean;
  progress_bar_message?: string;
}

export interface Spec {
  name: string;
  settings?: ExperimentSettings;
  data?: DataSettings;
  assets?: Asset[];
  conditions?: Record<string, Record<string, unknown>[]>;
  timeline: SpecNode[];
}

export interface CompileResult {
  source: string;
  plugins: string[];
  /** jsPsych release and npm package name + version per plugin, so exports can pin exactly. */
  jspsych: string;
  packages: Record<string, { name: string; version: string }>;
}
