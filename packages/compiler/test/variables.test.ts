import { describe, expect, it } from "vitest";
import { childrenOf, nodesAlongPath, slotsOf, walkNodes } from "../src/index.ts";
import type { SpecNode } from "../src/index.ts";

const trial: SpecNode = { kind: "trial", plugin: "html-keyboard-response" };

const named = (name: string): SpecNode => ({
  kind: "trial",
  plugin: "html-keyboard-response",
  tag: name,
});

const nested = (): SpecNode[] => [
  named("intro"),
  {
    kind: "block",
    conditions: "t",
    children: [
      named("cue"),
      {
        kind: "loop",
        repeat_while: { scope: "p", accuracy_below: 0.5 },
        children: [named("practice")],
      },
    ],
  },
  {
    kind: "branch",
    when: { scope: "p", accuracy_below: 0.5 },
    then: [named("again")],
    otherwise: [{ kind: "block", conditions: "t", children: [named("onward")] }],
  },
  { kind: "end", ending: "done" },
];

function visited(timeline: SpecNode[]) {
  const seen: string[] = [];
  walkNodes(timeline, (node, path) => {
    const label = node.kind === "trial" ? node.tag : node.kind;
    seen.push(`${path.join(".")} ${label}`);
  });
  return seen;
}

describe("walkNodes", () => {
  it("visits every step, each before the steps inside it, named by its selection path", () => {
    expect(visited(nested())).toEqual([
      "0 intro",
      "1 block",
      "1.0 cue",
      "1.1 loop",
      "1.1.0 practice",
      "2 branch",
      "2.0.0 again",
      "2.1.0 block",
      "2.1.0.0 onward",
      "3 end",
    ]);
  });

  it("visits nothing in an empty timeline", () => {
    expect(visited([])).toEqual([]);
  });
});

describe("nodesAlongPath", () => {
  const kinds = (timeline: SpecNode[], path: number[]) =>
    nodesAlongPath(timeline, path).map(({ node, path: at }) => `${at.join(".")} ${node.kind}`);

  it("gives the steps a path passes through, outermost first", () => {
    expect(kinds(nested(), [1, 1, 0])).toEqual(["1 block", "1.1 loop", "1.1.0 trial"]);
    expect(kinds(nested(), [2, 1, 0, 0])).toEqual(["2 branch", "2.1.0 block", "2.1.0.0 trial"]);
  });

  it("ends on the step that holds a slot when the path ends on the slot", () => {
    expect(kinds(nested(), [2, 1])).toEqual(["2 branch"]);
    expect(kinds(nested(), [2])).toEqual(["2 branch"]);
  });

  it("finds nothing for an empty path or timeline", () => {
    expect(nodesAlongPath(nested(), [])).toEqual([]);
    expect(nodesAlongPath([], [0])).toEqual([]);
  });

  it("finds nothing when the path leads nowhere", () => {
    expect(nodesAlongPath(nested(), [9])).toEqual([]);
    expect(nodesAlongPath(nested(), [1, 5])).toEqual([]);
    expect(nodesAlongPath(nested(), [2, 7, 0])).toEqual([]);
    expect(nodesAlongPath(nested(), [0, 0])).toEqual([]);
  });
});

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
