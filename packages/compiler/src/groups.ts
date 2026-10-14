import { literal } from "./emit.ts";
import { DATAPIPE_URL } from "./data.ts";
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
  // service knows. If it cannot be reached, a local draw keeps the session running unbalanced
  // rather than stranding the participant.
  const endpoint = `${(data?.endpoint ?? DATAPIPE_URL).replace(/\/+$/, "")}/api/condition/`;
  return {
    async: true,
    // jsPsych ends an async call-function trial when `done` is called, not when the promise settles.
    body: `async (done) => {
    try {
      const response = await fetch(${literal(endpoint)}, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentID: ${literal(data?.experiment_id ?? "")} }),
      });
      const assignment = await response.json();
      const names = ${literal(names)};
      ${GROUP_VARIABLE} = names[assignment.condition % names.length];
    } catch (error) {
      ${chooseLocally}
    }
    jsPsych.data.addProperties({ [${column}]: ${GROUP_VARIABLE} });
    done();
  }`,
  };
}

export function compileCheckpointStep(node: CheckpointNode) {
  return (
    `{\n  type: jsPsychCallFunction,\n  func: () => {},\n` +
    `  data: { checkpoint: ${literal(node.name)} },\n}`
  );
}
