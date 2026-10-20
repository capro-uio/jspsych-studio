import { describe, expect, it } from "vitest";
import { advance, IDLE } from "../src/lib/playback.svelte.ts";

describe("advance", () => {
  it("puts a starting step on screen, with the length it reported", () => {
    const next = advance(IDLE, { event: "start", step: "1.0", duration: 300 });
    expect(next).toEqual({ step: "1.0", phase: "step", duration: 300, run: 1 });
  });

  it("moves to the pause after a step once it finishes", () => {
    const running = advance(IDLE, { event: "start", step: "1.0", duration: 300 });
    const after = advance(running, { event: "finish", step: "1.0", duration: null });
    expect(after).toEqual({ step: "1.0", phase: "after", duration: null, run: 2 });
  });

  it("ignores a finish from a step that is no longer on screen", () => {
    const running = advance(IDLE, { event: "start", step: "1.1", duration: null });
    expect(advance(running, { event: "finish", step: "1.0", duration: null })).toBe(running);
  });

  it("restarts for the same step running again, as each row of a block does", () => {
    const first = advance(IDLE, { event: "start", step: "1.0", duration: 300 });
    const second = advance(first, { event: "start", step: "1.0", duration: 300 });
    expect(second.run).toBe(first.run + 1);
  });
});
