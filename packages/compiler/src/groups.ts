import { literal } from "./emit.ts";
import { conditionFallbackOf, dataPipeAddress } from "./data.ts";
import type { AssignNode, CheckpointNode, DataSettings } from "./types.ts";

export const GROUPS_VARIABLE = "assignedGroups";

export function groupColumn(node: AssignNode) {
  return node.record_as || "group";
}

// Each split keeps its group under its own column, which validation keeps unique, so splits nested
// inside one another, or repeated by a loop, never read each other's group.
function chosenGroup(node: AssignNode) {
  return `${GROUPS_VARIABLE}[${literal(groupColumn(node))}]`;
}

// jsPsych runs one timeline, so a between-subjects design is the whole study with every group's
// branch in it, each gated on the group this participant was assigned.
export function compileGroupGate(node: AssignNode, groupName: string, timeline: string) {
  return (
    `{\n  timeline: [${timeline}],\n` +
    `  conditional_function: () => ${chosenGroup(node)} === ${literal(groupName)},\n}`
  );
}

export function compileAssignmentStep(node: AssignNode, data: DataSettings | undefined) {
  const names = node.groups.map((group) => group.name);
  const draw = `jsPsych.randomization.sampleWithoutReplacement(${literal(names)}, 1)[0]`;
  return compileChoiceStep(
    {
      kept: chosenGroup(node),
      column: groupColumn(node),
      draw,
      // Balanced assignment needs to know what previous participants were given, which only the
      // data service knows.
      counted:
        node.method === "balanced" ? { options: literal(names), drawLocally: draw } : undefined,
    },
    data,
  );
}

/** A choice a step makes for each participant once, and how the step makes it. */
export interface Choice {
  /** Where the generated code keeps the participant's choice. */
  kept: string;
  /** The column the choice is recorded under. */
  column: string;
  /** Draws the choice in the browser. */
  draw: string;
  /**
   * Set when the data service's condition number picks the choice from `options`; a study that
   * opts in runs `drawLocally` when the service gives no number.
   */
  counted?: { options: string; drawLocally: string };
  /** Turns the kept choice into what is recorded, appended to it, such as `.join(", ")`. */
  format?: string;
}

// A participant gets one choice, however often a loop or block around the step runs it again:
// drawing anew would move them between groups or orders partway through, and a counted choice
// would take extra places in the data service's count.
export function compileChoiceStep(choice: Choice, data: DataSettings | undefined) {
  const { kept, counted } = choice;
  const record = `jsPsych.data.addProperties({ [${literal(choice.column)}]: ${kept}${choice.format ?? ""} });`;

  if (!counted) {
    return {
      async: false,
      body: `() => {
    ${kept} ??= ${choice.draw};
    ${record}
  }`,
    };
  }

  return {
    async: true,
    // jsPsych ends an async call-function trial when `done` is called, not when the promise settles.
    body: `async (done) => {
    if (!${kept}) {
      const options = ${counted.options};
      ${requestCondition(data, `${kept} = options[condition % options.length];`, `${kept} = ${counted.drawLocally};`)}
    }
    ${record}
    done();
  }`,
  };
}

const NO_CONDITION_MESSAGE =
  "<p>Sorry, this study cannot start right now: it could not find out which version of the " +
  "study to show you. Please close this window and let the researcher know.</p>";

/**
 * Asks the data service for this participant's condition number, which it counts across
 * participants, and runs `chosen` with it bound as `condition`. When no usable number comes back
 * the study stops with a message, as DataPipe advises, since a participant run in a guessed
 * condition looks like a good session until someone reads the data. A study that opts in runs
 * `drawLocally` instead, keeping the session going at the cost of balance.
 */
export function requestCondition(
  data: DataSettings | undefined,
  chosen: string,
  drawLocally: string,
) {
  const fallback =
    conditionFallbackOf(data) === "random"
      ? drawLocally
      : `jsPsych.abortExperiment(${literal(NO_CONDITION_MESSAGE)});\n      return;`;
  const endpoint = `${dataPipeAddress(data)}/api/condition/`;
  return `try {
      const response = await fetch(${literal(endpoint)}, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentID: ${literal(data?.experiment_id ?? "")} }),
      });
      if (!response.ok) throw new Error("the server responded with " + response.status);
      const { condition } = await response.json();
      if (!Number.isInteger(condition)) throw new Error("the server sent no condition number");
      ${chosen}
    } catch (error) {
      ${fallback}
    }`;
}

export function compileCheckpointStep(node: CheckpointNode) {
  return (
    `{\n  type: jsPsychCallFunction,\n  func: () => {},\n` +
    `  data: { checkpoint: ${literal(node.name)} },\n}`
  );
}
