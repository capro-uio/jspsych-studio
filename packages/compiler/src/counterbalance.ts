import { literal } from "./emit.ts";
import { requestCondition } from "./groups.ts";
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

// A participant gets one order, however often a loop or block around the step runs it again:
// drawing anew would give earlier rows a column describing an order they did not run, and a
// Latin square would take extra places in the data service's count.
export function compileOrderStep(node: CounterbalanceNode, data: DataSettings | undefined) {
  const names = node.tasks.map((task) => task.name);
  const order = chosenOrder(node);
  const record =
    `jsPsych.data.addProperties({ [${literal(orderColumn(node))}]: ` +
    `${order}.join(${literal(ORDER_SEPARATOR)}) });`;

  if (node.method === "random") {
    return {
      async: false,
      body: `() => {
    ${order} ??= jsPsych.randomization.shuffle(${literal(names)});
    ${record}
  }`,
    };
  }

  // Only the data service knows how many participants came before, so it picks the row of the
  // square. If it cannot be reached, a random row keeps every order one the square contains.
  return {
    async: true,
    // jsPsych ends an async call-function trial when `done` is called, not when the promise settles.
    body: `async (done) => {
    if (!${order}) {
      const orders = ${literal(latinSquareOrders(names))};
      ${requestCondition(
        data,
        `${order} = orders[condition % orders.length];`,
        `${order} = jsPsych.randomization.sampleWithoutReplacement(orders, 1)[0];`,
      )}
    }
    ${record}
    done();
  }`,
  };
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
