import { describe, expect, it } from "vitest";
import { firstFreeColumn, usualColumn } from "../src/choices.ts";
import type { AssignNode, CounterbalanceNode, SpecNode } from "../src/types.ts";

const trial: SpecNode = { kind: "trial", plugin: "html-keyboard-response" };

const split = (record_as?: string, inside: SpecNode[] = [trial]): AssignNode => ({
  kind: "assign",
  method: "random",
  ...(record_as === undefined ? {} : { record_as }),
  groups: [
    { name: "a", children: inside },
    { name: "b", children: [trial] },
  ],
});

const counterbalance = (record_as?: string): CounterbalanceNode => ({
  kind: "counterbalance",
  method: "random",
  ...(record_as === undefined ? {} : { record_as }),
  tasks: [
    { name: "x", children: [trial] },
    { name: "y", children: [trial] },
  ],
});

describe("the first free column for a new split or counterbalance", () => {
  it("is the usual name in a study with none", () => {
    expect(firstFreeColumn("assign", [])).toBe("group");
    expect(firstFreeColumn("counterbalance", [trial])).toBe("order");
    expect(usualColumn("assign")).toBe("group");
    expect(usualColumn("counterbalance")).toBe("order");
  });

  it("numbers the next one once the usual name is taken, named or by default", () => {
    expect(firstFreeColumn("assign", [split()])).toBe("group_2");
    expect(firstFreeColumn("assign", [split("group")])).toBe("group_2");
    expect(firstFreeColumn("counterbalance", [counterbalance(), counterbalance("order_2")])).toBe(
      "order_3",
    );
  });

  it("fills the first gap", () => {
    expect(firstFreeColumn("assign", [split("group"), split("group_3")])).toBe("group_2");
    expect(firstFreeColumn("assign", [split("group_2")])).toBe("group");
  });

  it("counts columns that the other kind of step records", () => {
    expect(firstFreeColumn("assign", [counterbalance("group")])).toBe("group_2");
    expect(firstFreeColumn("counterbalance", [split("order")])).toBe("order_2");
  });

  it("finds steps nested inside blocks, loops and other splits", () => {
    const timeline: SpecNode[] = [
      { kind: "block", conditions: "rows", children: [split(undefined, [split("group_2")])] },
      {
        kind: "loop",
        repeat_while: { scope: "t", accuracy_below: 1 },
        children: [counterbalance("group_3")],
      },
    ];
    expect(firstFreeColumn("assign", timeline)).toBe("group_4");
  });
});
