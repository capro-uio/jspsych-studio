import { literal } from "./emit.ts";
import { conditionFallbackOf, dataPipeAddress } from "./data.ts";
import type { AssignNode, CheckpointNode, DataSettings } from "./types.ts";

export const GROUP_VARIABLE = "assignedGroup";

export function groupColumn(node: AssignNode) {
  return node.record_as ?? "group";
}

// jsPsych runs one timeline, so a between-subjects design is the whole study with every group's
// branch in it, each gated on the group this participant was assigned.
export function compileGroupGate(node: AssignNode, groupName: string, timeline: string) {
  return (
    `{\n  timeline: [${timeline}],\n` +
    `  conditional_function: () => ${GROUP_VARIABLE} === ${literal(groupName)},\n}`
  );
}

export function compileAssignmentStep(node: AssignNode, data: DataSettings | undefined) {
  const names = node.groups.map((group) => group.name);
  const column = literal(groupColumn(node));

  const chooseLocally = `${GROUP_VARIABLE} = jsPsych.randomization.sampleWithoutReplacement(${literal(names)}, 1)[0];`;

  if (node.method === "random") {
    return {
      async: false,
      body: `() => {\n    ${chooseLocally}\n    jsPsych.data.addProperties({ [${column}]: ${GROUP_VARIABLE} });\n  }`,
    };
  }

  // Balanced assignment needs to know what previous participants were given, which only the data
  // service knows.
  const chooseCounted =
    `const names = ${literal(names)};\n      ` +
    `${GROUP_VARIABLE} = names[condition % names.length];`;
  return {
    async: true,
    // jsPsych ends an async call-function trial when `done` is called, not when the promise settles.
    body: `async (done) => {
    ${requestCondition(data, chooseCounted, chooseLocally)}
    jsPsych.data.addProperties({ [${column}]: ${GROUP_VARIABLE} });
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
