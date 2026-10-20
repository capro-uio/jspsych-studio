import type { StepEvent } from "./preview.ts";

export interface Playback {
  /** The step on screen in the preview, or the one just finished while the pause after it runs. */
  step: string | null;
  phase: "step" | "after";
  /** How long the step will run, when the study said as it started. */
  duration: number | null;
  /** Counts every change, so the strip can restart its playhead even for the same step. */
  run: number;
}

export const IDLE: Playback = { step: null, phase: "step", duration: null, run: 0 };

/** Where the preview is once it reports a step starting or finishing. */
export function advance(current: Playback, event: StepEvent): Playback {
  if (event.event === "start") {
    return { step: event.step, phase: "step", duration: event.duration, run: current.run + 1 };
  }
  // A finish only counts for the step on screen; one arriving late belongs to a run gone by.
  if (event.step !== current.step) return current;
  return { ...current, phase: "after", duration: null, run: current.run + 1 };
}

export const playback = $state<Playback>({ ...IDLE });

export function followPreview(event: StepEvent) {
  Object.assign(playback, advance(playback, event));
}

/** A new or restarted preview has nothing on screen yet. */
export function resetPlayback() {
  playback.step = null;
  playback.phase = "step";
  playback.duration = null;
}
