import { literal } from "./emit.ts";
import { compileChoiceStep } from "./groups.ts";
import type { CounterbalanceNode, DataSettings } from "./types.ts";

export const ORDERS_VARIABLE = "taskOrders";

export const TASK_VARIABLE = "counterbalanced_task";

/** How the order is written in the data, e.g. "flanker > stroop". */
export const ORDER_SEPARATOR = " > ";

export function orderColumn(node: CounterbalanceNode) {
  return node.record_as || "order";
}

// Each counterbalanced step keeps its order under its own column, which validation keeps unique,
// so steps nested inside one another, or repeated by a loop, never read each other's order.
function chosenOrder(node: CounterbalanceNode) {
  return `${ORDERS_VARIABLE}[${literal(orderColumn(node))}]`;
}

/**
 * The rows of a balanced Latin square over the tasks: each task takes each position equally often,
 * and each task directly follows every other equally often. With an odd number of tasks that takes
 * the square's rows and their reverses, so there are twice as many orders as tasks.
 */
export function latinSquareOrders<T>(tasks: T[]): T[][] {
  const count = tasks.length;
  let low = 0;
  let high = count - 1;
  const firstRow = tasks.map((_, position) =>
    position < 2 || position % 2 === 1 ? low++ : high--,
  );
  const rows = tasks.map((_, shift) => firstRow.map((offset) => tasks[(offset + shift) % count]));
  return count % 2 === 0 ? rows : [...rows, ...rows.map((row) => [...row].reverse())];
}

export function compileOrderStep(node: CounterbalanceNode, data: DataSettings | undefined) {
  const names = node.tasks.map((task) => task.name);
  return compileChoiceStep(
    {
      kept: chosenOrder(node),
      column: orderColumn(node),
      draw: `jsPsych.randomization.shuffle(${literal(names)})`,
      // Only the data service knows how many participants came before, so it picks the row of the
      // square. A study that draws locally when it cannot be reached still runs a row of it.
      counted:
        node.method === "latin_square"
          ? {
              options: literal(latinSquareOrders(names)),
              drawLocally: "jsPsych.randomization.sampleWithoutReplacement(options, 1)[0]",
            }
          : undefined,
      format: `.join(${literal(ORDER_SEPARATOR)})`,
    },
    data,
  );
}

// jsPsych fixes a timeline's contents up front, but lets a timeline pick the order it visits its
// timeline variables in. So the tasks become one row each, and every row runs only its own task.
export function compileCounterbalancedTasks(node: CounterbalanceNode, timelines: string[]) {
  const names = node.tasks.map((task) => task.name);
  const gates = names.map(
    (name, index) =>
      `{\n  timeline: [${timelines[index]}],\n` +
      `  conditional_function: () => ` +
      `jsPsych.evaluateTimelineVariable(${literal(TASK_VARIABLE)}) === ${literal(name)},\n}`,
  );
  const rows = names.map((name) => ({ [TASK_VARIABLE]: name }));
  return `{
  timeline: [${gates.join(", ")}],
  timeline_variables: ${literal(rows)},
  sample: {
    type: "custom",
    fn: () => ${chosenOrder(node)}.map((task) => ${literal(names)}.indexOf(task)),
  },
}`;
}
