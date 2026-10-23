import { describe, expect, it } from "vitest";
import {
  conditionSteps,
  dataPipeSetup,
  dataPipeSetupMarkdown,
  requiredFields,
  type DashboardSetting,
} from "../src/datapipe-setup.ts";
import { datasetDescription } from "../src/metadata.ts";
import type { DataSettings, Spec, SpecNode } from "../src/types.ts";

const screen = (text: string): SpecNode => ({
  kind: "trial",
  plugin: "html-keyboard-response",
  params: { stimulus: text },
  record: { phase: "main" },
});

const groups = (count: number, method: "balanced" | "random" = "balanced"): SpecNode => ({
  kind: "assign",
  method,
  groups: Array.from({ length: count }, (_, index) => ({
    name: `group ${index + 1}`,
    children: [screen(`<p>${index + 1}</p>`)],
  })),
});

const orders = (tasks: number): SpecNode => ({
  kind: "counterbalance",
  method: "latin_square",
  record_as: "task_order",
  tasks: Array.from({ length: tasks }, (_, index) => ({
    name: `task ${index + 1}`,
    children: [screen(`<p>${index + 1}</p>`)],
  })),
});

const recording: SpecNode = {
  kind: "trial",
  plugin: "html-audio-response",
  params: { stimulus: "<p>Say a word</p>" },
};

const study = (timeline: SpecNode[], extra: Partial<Spec> = {}, data: Partial<DataSettings> = {}) =>
  ({
    name: "memory study",
    data: { save: "post", experiment_id: "abc123DEF456", ...data },
    timeline,
    ...extra,
  }) satisfies Spec;

function setting(spec: Spec, name: string): DashboardSetting {
  const found = dataPipeSetup(spec).dashboard.find((entry) => entry.setting === name);
  if (!found) throw new Error(`no "${name}" setting`);
  return found;
}

const field = (spec: Spec, label: string) =>
  dataPipeSetup(spec).experiment.find((entry) => entry.label === label);

describe("what to set up on DataPipe", () => {
  it("follows DataPipe's dashboard in its own order", () => {
    expect(dataPipeSetup(study([screen("<p>hi</p>")])).dashboard.map((s) => s.setting)).toEqual([
      "Accept new data",
      "Accept base64 file uploads",
      "Assign conditions in sequence",
      "Stop after a set number of sessions",
      "Check submissions before storing them",
      "Generate Psych-DS metadata",
    ]);
  });

  it("offers the storage DataPipe still takes, and says OSF is closed", () => {
    const setup = dataPipeSetup(study([screen("<p>hi</p>")]));
    expect(setup.storage.map((choice) => choice.name)).toEqual([
      "Google Drive",
      "Dataverse",
      "Zenodo",
    ]);
    expect(setup.closedStorage).toContain("OSF");
  });

  it("fills in the experiment's title, authors and Psych-DS description", () => {
    const spec = study([screen("<p>hi</p>")], {
      authors: [{ name: "Ada Lovelace" }, { name: "  " }, { name: "Alan Turing" }],
    });
    expect(field(spec, "Title")?.value).toBe("memory study");
    expect(field(spec, "Author name")?.value).toBe("Ada Lovelace; Alan Turing");
    expect(field(spec, "Description")?.value).toBe(
      datasetDescription(spec, [], { jspsych: "8.0.0" }).description,
    );
    expect(field(spec, "Affiliation")?.value).toBeUndefined();
    expect(field(spec, "Affiliation")?.note).toContain("Who made this");
  });

  it("fills in the authors' affiliations, each once, ignoring blank ones and non-text", () => {
    const spec = study([screen("<p>hi</p>")], {
      authors: [
        { name: "Ada Lovelace", affiliation: " University of London " },
        { name: "Alan Turing", affiliation: "University of Manchester" },
        { name: "Charles Babbage", affiliation: "University of London" },
        { name: "Grace Hopper", affiliation: "  " },
        { name: "Hand Edited", affiliation: 5 as unknown as string },
        { name: " ", affiliation: "Nowhere" },
      ],
    });
    const affiliation = field(spec, "Affiliation");
    expect(affiliation?.value).toBe("University of London; University of Manchester");
    expect(affiliation?.note).not.toContain("type yours in");
  });

  it("asks for authors when the study names none", () => {
    const spec = study([screen("<p>hi</p>")]);
    expect(field(spec, "Author name")?.value).toBeUndefined();
    expect(field(spec, "Author name")?.note).toContain("Who made this");
  });

  it("turns base64 uploads on only for a study that records", () => {
    expect(setting(study([screen("<p>hi</p>")]), "Accept base64 file uploads").value).toBe("off");
    const recorded = setting(study([recording]), "Accept base64 file uploads");
    expect(recorded.value).toBe("on");
    expect(recorded.note).toContain("recording");
  });

  it("leaves condition assignment off when nothing asks DataPipe for a condition", () => {
    for (const timeline of [[screen("<p>hi</p>")], [groups(2, "random")]]) {
      const conditions = setting(study(timeline), "Assign conditions in sequence");
      expect(conditions.value).toBe("off");
      expect(conditions.fields).toEqual([]);
      expect(conditions.warning).toBeUndefined();
    }
  });

  it("gives the number of conditions as the number of balanced groups, with a warning", () => {
    const conditions = setting(study([groups(3)]), "Assign conditions in sequence");
    expect(conditions.value).toBe("on");
    expect(conditions.fields).toEqual([
      { label: "How many conditions?", value: "3", note: "One for each of the 3 groups." },
    ]);
    expect(conditions.warning).toContain("exactly 3");
    expect(conditions.note).toContain("stops and tells the participant");
  });

  it("says groups may become unbalanced when the study draws locally instead", () => {
    const spec = study([groups(2)], {}, { condition_fallback: "random" });
    expect(setting(spec, "Assign conditions in sequence").note).toContain("unbalanced");
  });

  it("counts the rows of a Latin square, twice the tasks when there is an odd number", () => {
    expect(conditionSteps(study([orders(3)]))).toEqual([
      { kind: "orders", column: "task_order", count: 6 },
    ]);
    const conditions = setting(study([orders(4)]), "Assign conditions in sequence");
    expect(conditions.fields[0].value).toBe("4");
  });

  it("warns, rather than giving one number, when several steps ask for a condition", () => {
    const spec = study([groups(2), orders(2)]);
    expect(conditionSteps(spec)).toHaveLength(2);
    const conditions = setting(spec, "Assign conditions in sequence");
    expect(conditions.value).toBe("on");
    expect(conditions.warning).toContain("at 2 steps");
    expect(conditions.warning).toContain(
      "the split recording “group” (2 groups) and the counterbalance recording “task_order” (2 orders)",
    );
    expect(conditions.warning).toContain("will not come out balanced");
    expect(conditions.fields).toHaveLength(1);
    const [count] = conditions.fields;
    expect(count.label).toBe("How many conditions?");
    expect(count.value).toBeUndefined();
    expect(count.note).toContain("no single right number");
    expect(count.note).toContain("the warning above");
  });

  it("puts no number in the file's conditions row when several steps ask", () => {
    const markdown = dataPipeSetupMarkdown(study([groups(2), orders(3)]));
    expect(markdown).toContain(
      "- **How many conditions?:** There is no single right number for this study",
    );
    expect(markdown).toContain(
      "> **Warning:** This study asks DataPipe for a condition at 2 steps",
    );
  });

  it("leaves the session limit optional when the study gives no planned sample size", () => {
    const limit = setting(study([screen("<p>hi</p>")]), "Stop after a set number of sessions");
    expect(limit.value).toBe("optional");
    expect(limit.note).toContain(".partial.json");
    expect(limit.note).toContain("Recruitment");
    expect(limit.fields).toEqual([]);
  });

  it("turns the session limit on at the study's planned sample size", () => {
    const spec = study([screen("<p>hi</p>")], { sample_size: 120 });
    const limit = setting(spec, "Stop after a set number of sessions");
    expect(limit.value).toBe("on");
    expect(limit.note).toContain("once the 120 participants the study plans to recruit");
    expect(limit.note).toContain(".partial.json");
    expect(limit.fields.map((entry) => [entry.label, entry.value])).toEqual([
      ["How many total sessions?", "120"],
    ]);
    expect(dataPipeSetupMarkdown(spec)).toContain("**How many total sessions?:** `120`");
  });

  it.each([0, -5, 2.5])("gives no session limit for a sample size of %s", (sampleSize) => {
    const spec = study([screen("<p>hi</p>")], { sample_size: sampleSize });
    expect(setting(spec, "Stop after a set number of sessions").value).toBe("optional");
  });

  it("allows CSV and requires only the columns every upload has", () => {
    const spec = study([groups(2), screen("<p>hi</p>")]);
    const check = setting(spec, "Check submissions before storing them");
    expect(check.fields.map((entry) => [entry.label, entry.value])).toEqual([
      ["Allowed format", "CSV"],
      ["Required fields", "trial_type, trial_index, time_elapsed, participant_id"],
    ]);
    expect(requiredFields(spec)).not.toContain("group");
    expect(requiredFields(spec)).not.toContain("phase");
    expect(requiredFields(spec)).not.toContain("plugin_version");
  });

  it("recommends Psych-DS and warns that DataPipe locks it once data arrives", () => {
    const psychDs = setting(study([screen("<p>hi</p>")]), "Generate Psych-DS metadata");
    expect(psychDs.value).toBe("on");
    expect(psychDs.warning).toContain("a pilot included");
  });

  it("explains .partial.json files whether or not the study saves as it goes", () => {
    expect(dataPipeSetup(study([screen("<p>hi</p>")])).partialFiles).toContain("no .partial.json");
    expect(
      dataPipeSetup(study([screen("<p>hi</p>")], {}, { stream: true })).partialFiles,
    ).toContain("one .partial.json file for each participant who leaves partway");
  });

  it("points at the study's own DataPipe, and its experiment ID once it has one", () => {
    const own = dataPipeSetup(
      study([screen("<p>hi</p>")], {}, { endpoint: "https://pipe.example/" }),
    );
    expect(own.address).toBe("https://pipe.example");
    expect(own.link).toBe("https://pipe.example");
    const fresh = dataPipeSetup(study([screen("<p>hi</p>")], {}, { endpoint: undefined }));
    expect(fresh.address).toBe("https://pipe.jspsych.org");
    const odd = dataPipeSetup(
      study([screen("<p>hi</p>")], {}, { endpoint: "javascript:alert(1)" }),
    );
    expect(odd.link).toBeUndefined();
    const local = dataPipeSetup(
      study([screen("<p>hi</p>")], {}, { endpoint: "http://localhost:8080/" }),
    );
    expect(local.link).toBe("http://localhost:8080");
    const plain = dataPipeSetup(
      study([screen("<p>hi</p>")], {}, { endpoint: "http://pipe.example/" }),
    );
    expect(plain.link).toBeUndefined();
    const empty = dataPipeSetup(study([screen("<p>hi</p>")], {}, { endpoint: "" }));
    expect(empty.link).toBe("https://pipe.jspsych.org");
    const noId = dataPipeSetupMarkdown(study([screen("<p>hi</p>")], {}, { experiment_id: "" }));
    expect(noId).toContain("Paste it into “Experiment ID”");
    expect(noId).not.toContain("This download uploads to the experiment");
  });
});

describe("the setup checklist as a file", () => {
  const spec = study([recording, groups(3)], { authors: [{ name: "Ada Lovelace" }] });
  const markdown = dataPipeSetupMarkdown(spec);

  it("has DataPipe's three steps in order", () => {
    const headings = markdown.split("\n").filter((line) => line.startsWith("## "));
    expect(headings).toEqual([
      "## 1. Create the experiment",
      "## 2. On its dashboard",
      "## 3. Paste the experiment ID",
    ]);
  });

  it("carries the same values the builder shows", () => {
    const setup = dataPipeSetup(spec);
    for (const entry of setup.experiment) {
      if (entry.value) expect(markdown).toContain(`**${entry.label}:** \`${entry.value}\``);
    }
    for (const entry of setup.dashboard) {
      expect(markdown).toContain(`### ${entry.setting}: ${entry.value}`);
      if (entry.warning) expect(markdown).toContain(`> **Warning:** ${entry.warning}`);
    }
    expect(markdown).toContain("**How many conditions?:** `3`");
    expect(markdown).toContain("### Accept base64 file uploads: on");
    expect(markdown).toContain(setup.partialFiles);
    expect(markdown).toContain("uploads to the experiment `abc123DEF456`");
  });

  it("links the study's DataPipe only when its address is a web address", () => {
    expect(markdown).toContain("DataPipe at <https://pipe.jspsych.org>.");
    const odd = dataPipeSetupMarkdown(
      study([screen("<p>hi</p>")], {}, { endpoint: "javascript:alert(1)" }),
    );
    expect(odd).toContain("DataPipe at `javascript:alert(1)`.");
  });

  it("keeps a value with backticks in it readable as code", () => {
    const odd = dataPipeSetupMarkdown(study([screen("<p>hi</p>")], { name: "a `b` c" }));
    expect(odd).toContain("**Title:** `` a `b` c ``");
  });
});
