import { describe, expect, it } from "vitest";
import { childrenOf, slotsOf } from "../src/index.ts";
import type { SpecNode } from "../src/index.ts";

const trial: SpecNode = { kind: "trial", plugin: "html-keyboard-response" };

describe("childrenOf", () => {
  it("gives the steps a block or a loop runs in order", () => {
    expect(childrenOf({ kind: "block", conditions: "t", children: [trial] })).toEqual([trial]);
    expect(
      childrenOf({
        kind: "loop",
        repeat_while: { scope: "p", accuracy_below: 0.5 },
        children: [trial],
      }),
    ).toEqual([trial]);
  });

  it("has nothing for steps that hold none or hold several lists", () => {
    const branch: SpecNode = {
      kind: "branch",
      when: { scope: "p", accuracy_below: 0.5 },
      then: [trial],
    };
    expect(childrenOf(trial)).toBeNull();
    expect(childrenOf({ kind: "checkpoint", name: "here" })).toBeNull();
    expect(childrenOf(branch)).toBeNull();
    expect(slotsOf(branch)).not.toBeNull();
  });
});
