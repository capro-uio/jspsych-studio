import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { latinSquareOrders } from "../src/counterbalance.ts";
import { dataColumns } from "../src/metadata.ts";
import type { CounterbalanceNode, Spec, SpecNode } from "../src/types.ts";
import type { SpecError } from "../src/validate.ts";
import { slotsOf } from "../src/variables.ts";
import { schemas } from "./schemas.ts";

const trial = (stimulus: string, tag?: string) => ({
  kind: "trial" as const,
  plugin: "html-keyboard-response",
  ...(tag ? { tag } : {}),
  params: { stimulus },
});

const counterbalance = (overrides: Partial<CounterbalanceNode> = {}): CounterbalanceNode => ({
  kind: "counterbalance",
  method: "random",
  tasks: [
    { name: "flanker", children: [trial("<p>Flanker</p>")] },
    { name: "stroop", children: [trial("<p>Stroop</p>")] },
  ],
  ...overrides,
});

const uploading: Spec["data"] = { save: "post", experiment_id: "abc123DEF456" };

const study = (timeline: SpecNode[], data?: Spec["data"]): Spec => ({
  name: "task-order",
  data,
  timeline,
});

const compiled = (timeline: SpecNode[], data?: Spec["data"]) =>
  compileSpec(study(timeline, data), schemas).source;

const letters = (count: number) => [..."ABCDEFG"].slice(0, count);

function positionCounts(rows: string[][]) {
  return rows[0].map((_, position) => {
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row[position]] = (counts[row[position]] ?? 0) + 1;
    return counts;
  });
}

function successions(rows: string[][]) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (let index = 1; index < row.length; index += 1) {
      const pair = `${row[index - 1]}${row[index]}`;
      counts[pair] = (counts[pair] ?? 0) + 1;
    }
  }
  return counts;
}

describe("a balanced Latin square", () => {
  it("swaps two tasks between two orders", () => {
    expect(latinSquareOrders(["a", "b"])).toEqual([
      ["a", "b"],
      ["b", "a"],
    ]);
  });

  it.each([2, 4, 6])("puts each of %i tasks in every position once", (count) => {
    const rows = latinSquareOrders(letters(count));
    expect(rows).toHaveLength(count);
    for (const counts of positionCounts(rows)) {
      expect(Object.values(counts)).toEqual(Array(count).fill(1));
    }
  });

  it.each([2, 4, 6])("has each of %i tasks follow every other exactly once", (count) => {
    const pairs = successions(latinSquareOrders(letters(count)));
    expect(Object.keys(pairs)).toHaveLength(count * (count - 1));
    expect(new Set(Object.values(pairs))).toEqual(new Set([1]));
  });

  it.each([3, 5])("doubles the square for an odd %i tasks to stay balanced", (count) => {
    const rows = latinSquareOrders(letters(count));
    expect(rows).toHaveLength(2 * count);
    for (const counts of positionCounts(rows)) {
      expect(Object.values(counts)).toEqual(Array(count).fill(2));
    }
    const pairs = successions(rows);
    expect(Object.keys(pairs)).toHaveLength(count * (count - 1));
    expect(new Set(Object.values(pairs))).toEqual(new Set([2]));
  });

  it("starts with a plain Latin square, so the first participants already balance position", () => {
    const rows = latinSquareOrders(letters(3)).slice(0, 3);
    for (const counts of positionCounts(rows)) {
      expect(Object.values(counts)).toEqual([1, 1, 1]);
    }
  });
});

describe("counterbalancing the order of tasks", () => {
  it("shuffles the tasks in the browser and runs each in the order drawn", () => {
    const source = compiled([counterbalance()]);
    expect(source).toContain("const taskOrders = {};");
    expect(source).toContain(
      'taskOrders["order"] ??= jsPsych.randomization.shuffle(["flanker","stroop"]);',
    );
    expect(source).toContain(
      'timeline_variables: [{"counterbalanced_task":"flanker"},{"counterbalanced_task":"stroop"}]',
    );
    expect(source).toContain('type: "custom"');
    expect(source).toContain(
      'taskOrders["order"].map((task) => ["flanker","stroop"].indexOf(task))',
    );
    expect(source).toContain(
      'conditional_function: () => jsPsych.evaluateTimelineVariable("counterbalanced_task") === "stroop"',
    );
  });

  it("writes each task's steps once, however many orders there are", () => {
    const source = compiled([counterbalance({ method: "latin_square" })], uploading);
    expect(source.match(/Flanker/g)).toHaveLength(1);
  });

  it("records the order on every row, under a chosen column name", () => {
    expect(compiled([counterbalance()])).toContain(
      'addProperties({ ["order"]: taskOrders["order"].join(" > ") })',
    );
    expect(compiled([counterbalance({ record_as: "task_order" })])).toContain(
      'addProperties({ ["task_order"]: taskOrders["task_order"].join(" > ") })',
    );
  });

  it("asks the data service which row of a Latin square to use", () => {
    const source = compiled([counterbalance({ method: "latin_square" })], uploading);
    expect(source).toContain('const orders = [["flanker","stroop"],["stroop","flanker"]];');
    expect(source).toContain("/api/condition/");
    expect(source).toContain('experimentID: "abc123DEF456"');
    expect(source).toContain('taskOrders["order"] = orders[condition % orders.length];');
    expect(source).toContain("async: true");
  });

  it("falls back to a random row of the square if the service cannot be reached", () => {
    const source = compiled([counterbalance({ method: "latin_square" })], uploading);
    const fallback = source.slice(source.indexOf("catch"));
    expect(fallback).toContain("sampleWithoutReplacement(orders, 1)[0]");
  });

  it("asks the service only the first time a loop or block runs the step", () => {
    const source = compiled([counterbalance({ method: "latin_square" })], uploading);
    const body = source.slice(source.indexOf("async (done)"));
    expect(body.indexOf('if (!taskOrders["order"]) {')).toBeLessThan(body.indexOf("fetch("));
  });

  it("records under the default column when the chosen name is left empty", () => {
    expect(compiled([counterbalance({ record_as: "" })])).toContain('taskOrders["order"]');
  });

  it("lists the order column among the data's variables", () => {
    expect(dataColumns(study([counterbalance()]))).toContain("order");
    expect(dataColumns(study([counterbalance({ record_as: "sequence" })]))).toContain("sequence");
  });

  it("holds its tasks as child lists, so steps inside can be found and edited", () => {
    expect(slotsOf(counterbalance())?.map((slot) => slot.name)).toEqual(["flanker", "stroop"]);
  });

  it("lets a later branch judge trials tagged inside a task", () => {
    const tagged = counterbalance({
      tasks: [
        { name: "flanker", children: [trial("<p>Flanker</p>", "flanker")] },
        { name: "stroop", children: [trial("<p>Stroop</p>")] },
      ],
    });
    const branch: SpecNode = {
      kind: "branch",
      when: { scope: "flanker", accuracy_at_least: 0.5 },
      then: [trial("<p>well done</p>")],
    };
    expect(() => compiled([tagged, branch])).not.toThrow();
  });
});

describe("what counterbalancing refuses", () => {
  it("a Latin square when data is only downloaded, saying only random order works", () => {
    expect(() =>
      compiled([counterbalance({ method: "latin_square" })], { save: "download" }),
    ).toThrow(/Latin-square order needs data uploading.*when data is downloaded, only random/);
  });

  it("a Latin square when data is not saved at all", () => {
    expect(() => compiled([counterbalance({ method: "latin_square" })])).toThrow(
      /Latin-square order needs data uploading/,
    );
  });

  it("but takes random order with data downloaded", () => {
    expect(() => compiled([counterbalance()], { save: "download" })).not.toThrow();
  });

  it("fewer than two tasks", () => {
    const lonely = counterbalance({ tasks: [{ name: "only", children: [trial("a")] }] });
    expect(() => compiled([lonely])).toThrow(/at least two tasks/);
  });

  it("tasks that share a name or have none", () => {
    const same = counterbalance({
      tasks: [
        { name: "same", children: [trial("a")] },
        { name: "same", children: [trial("b")] },
      ],
    });
    expect(() => compiled([same])).toThrow(/task names must be different/);

    const unnamed = counterbalance({
      tasks: [
        { name: "", children: [trial("a")] },
        { name: "named", children: [trial("b")] },
      ],
    });
    expect(() => compiled([unnamed])).toThrow(/every task needs a name/);
  });

  it("a task with nothing in it", () => {
    const hollow = counterbalance({
      tasks: [
        { name: "full", children: [trial("a")] },
        { name: "hollow", children: [] },
      ],
    });
    expect(() => compiled([hollow])).toThrow(/task "hollow" has no steps/);
  });

  it("problems in a task's steps, located inside that task", () => {
    const broken = counterbalance({
      tasks: [
        { name: "fine", children: [trial("a")] },
        { name: "broken", children: [{ kind: "trial", plugin: "no-such-plugin" }] },
      ],
    });
    const problems = (() => {
      try {
        compiled([broken]);
        return [];
      } catch (error) {
        return (error as SpecError).problems;
      }
    })();
    expect(problems).toEqual([{ message: 'unknown plugin "no-such-plugin"', path: [0, 1, 0] }]);
  });

  it("a task name holding the separator the recorded order uses", () => {
    const ambiguous = counterbalance({
      tasks: [
        { name: "a > b", children: [trial("a")] },
        { name: "c", children: [trial("c")] },
      ],
    });
    expect(() => compiled([ambiguous])).toThrow(/task "a > b" contains " > "/);

    const tight = counterbalance({
      tasks: [
        { name: "a>b", children: [trial("a")] },
        { name: "c", children: [trial("c")] },
      ],
    });
    expect(() => compiled([tight])).not.toThrow();
  });

  it("an enclosing conditions column named like the step's own task variable", () => {
    const inside = (column: string): Spec => ({
      name: "task-order",
      conditions: { rounds: [{ [column]: 1 }] },
      timeline: [{ kind: "block", conditions: "rounds", children: [counterbalance()] }],
    });
    expect(() => compileSpec(inside("counterbalanced_task"), schemas)).toThrow(
      /column named "counterbalanced_task"/,
    );
    expect(() => compileSpec(inside("round"), schemas)).not.toThrow();
  });

  it("two counterbalanced steps recording their order in the same column", () => {
    const outer = counterbalance({
      tasks: [
        { name: "first", children: [counterbalance()] },
        { name: "second", children: [trial("b")] },
      ],
    });
    expect(() => compiled([outer])).toThrow(/also records its order as "order"/);

    const renamed = counterbalance({
      tasks: [
        { name: "first", children: [counterbalance({ record_as: "inner_order" })] },
        { name: "second", children: [trial("b")] },
      ],
    });
    expect(() => compiled([renamed])).not.toThrow();
  });
});
