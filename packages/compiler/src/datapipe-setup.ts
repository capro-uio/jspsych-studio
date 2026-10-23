import { latinSquareOrders, orderColumn } from "./counterbalance.ts";
import { conditionFallbackNote, dataPipeAddress, savesAsItGoes } from "./data.ts";
import { groupColumn } from "./groups.ts";
import { dataColumns, datasetSummary } from "./metadata.ts";
import { usesRecordings } from "./recordings.ts";
import { walkNodes } from "./variables.ts";
import type { Spec } from "./types.ts";

/** A value to type into DataPipe, or a note on what to type when Tachisto cannot know it. */
export interface SetupField {
  label: string;
  value?: string;
  note: string;
}

export interface StorageChoice {
  name: string;
  note: string;
}

/** One of DataPipe's dashboard settings, under the label DataPipe gives it. */
export interface DashboardSetting {
  setting: string;
  value: "on" | "off" | "optional";
  note: string;
  /** A mistake here goes unnoticed or cannot be undone, so it is said prominently. */
  warning?: string;
  fields: SetupField[];
}

/** A step that asks DataPipe for the participant's condition, and how many it needs. */
export interface ConditionStep {
  kind: "groups" | "orders";
  column: string;
  count: number;
}

export interface DataPipeSetup {
  address: string;
  /** The address as a link, only when it is a web address, so nothing else is ever linked. */
  link?: string;
  titles: typeof TITLES;
  storage: StorageChoice[];
  closedStorage: string;
  experiment: SetupField[];
  dashboard: DashboardSetting[];
  partialFiles: string;
  whereTheIdIs: string;
}

const TITLES = {
  create: "Create the experiment",
  dashboard: "On its dashboard",
  partialFiles: "About .partial.json files",
  paste: "Paste the experiment ID",
};

const WEB_ADDRESS = /^https?:\/\/\S+$/i;

// Columns every uploaded file has, whichever way the session ends: jsPsych writes the first three
// on every row, and Tachisto adds the participant's id to every row of a study that saves data.
// plugin_version is left out because a plugin that declares no version leaves it empty, and the
// study's own columns because a participant who stops early may never reach the step writing them.
const ON_EVERY_ROW = ["trial_type", "trial_index", "time_elapsed", "participant_id"];

export function requiredFields(spec: Spec) {
  const columns = new Set(dataColumns(spec, []));
  return ON_EVERY_ROW.filter((column) => columns.has(column));
}

/** The steps that ask DataPipe for a condition, in the order the study reaches them. */
export function conditionSteps(spec: Spec): ConditionStep[] {
  const steps: ConditionStep[] = [];
  walkNodes(spec.timeline, (node) => {
    if (node.kind === "assign" && node.method === "balanced") {
      steps.push({ kind: "groups", column: groupColumn(node), count: node.groups.length });
    }
    if (node.kind === "counterbalance" && node.method === "latin_square") {
      steps.push({
        kind: "orders",
        column: orderColumn(node),
        count: latinSquareOrders(node.tasks).length,
      });
    }
  });
  return steps;
}

function authorNames(spec: Spec) {
  const names = (spec.authors ?? []).map((author) => author.name.trim()).filter(Boolean);
  return names.length > 0 ? names.join("; ") : undefined;
}

function experimentFields(spec: Spec): SetupField[] {
  const authors = authorNames(spec);
  return [
    { label: "Title", value: spec.name, note: "Every storage option asks for it." },
    {
      label: "Author name",
      value: authors,
      note: authors
        ? "Zenodo and Dataverse ask for it."
        : "Zenodo and Dataverse ask for it. Add the study's authors under “Who made this” first.",
    },
    {
      label: "Affiliation",
      note: "Zenodo asks for it, optionally. Tachisto does not record affiliations, so type yours in.",
    },
    {
      label: "Description",
      value: datasetSummary(spec),
      note: "Zenodo and Dataverse ask for it. It matches the study's Psych-DS description.",
    },
  ];
}

const STORAGE: StorageChoice[] = [
  {
    name: "Google Drive",
    note: "Files go to a folder in your Drive; a parent folder is optional.",
  },
  {
    name: "Dataverse",
    note: "Files go to a Dataverse collection. It also asks for the collection's alias and a contact email, and optionally a subject.",
  },
  {
    name: "Zenodo",
    note: "Files go to a Zenodo record, described by the title, authors and description below.",
  },
];

function conditionsSetting(spec: Spec): DashboardSetting {
  const setting = "Assign conditions in sequence";
  const steps = conditionSteps(spec);
  const fallbackNote = conditionFallbackNote(spec.data);
  if (steps.length === 0) {
    return {
      setting,
      value: "off",
      note: "This study asks DataPipe for no conditions: any groups or task orders are drawn in the browser.",
      fields: [],
    };
  }
  if (steps.length > 1) {
    const listed = steps.map((step) => `“${step.column}” (${step.count} ${step.kind})`).join(", ");
    return {
      setting,
      value: "on",
      note: fallbackNote,
      warning:
        `This study asks DataPipe for a condition at ${steps.length} steps: ${listed}. DataPipe ` +
        "keeps one count per experiment and moves it on at every request, so the steps are not " +
        "balanced against each other. Count only one of them on DataPipe and draw the others at random.",
      fields: [],
    };
  }
  const [{ kind, count }] = steps;
  const what = kind === "groups" ? `${count} groups` : `${count} orders of the Latin square`;
  return {
    setting,
    value: "on",
    note: `This study asks DataPipe which of its ${what} each participant gets. ${fallbackNote}`,
    warning:
      `Set “How many conditions?” to exactly ${count}. Tachisto hands out the ${kind} by counting ` +
      `round them, so if DataPipe counts to any other number, some ${kind} get more participants ` +
      "than others and nothing warns you.",
    fields: [
      {
        label: "How many conditions?",
        value: String(count),
        note: `One for each of the ${what}.`,
      },
    ],
  };
}

function dashboardSettings(spec: Spec): DashboardSetting[] {
  const recordings = usesRecordings(spec);
  return [
    {
      setting: "Accept new data",
      value: "on",
      note: "Turn it off to pause collecting, or once you have enough.",
      fields: [],
    },
    {
      setting: "Accept base64 file uploads",
      value: recordings ? "on" : "off",
      note: recordings
        ? "This study uploads each audio or video recording as a file of its own, which DataPipe only accepts with this on. Otherwise the recordings stay inside the data as text."
        : "This study records no audio or video, so it uploads no files of its own.",
      fields: [],
    },
    conditionsSetting(spec),
    {
      setting: "Stop after a set number of sessions",
      value: "optional",
      note: "Set it to the number of participants you plan to recruit, and DataPipe stops accepting data once that many have finished. Files from participants who left partway (.partial.json) do not count toward it.",
      fields: [],
    },
    {
      setting: "Check submissions before storing them",
      value: "on",
      note: "DataPipe then refuses a file that is not this study's data.",
      fields: [
        { label: "Allowed format", value: "CSV", note: "This study uploads its data as CSV." },
        {
          label: "Required fields",
          value: requiredFields(spec).join(", "),
          note: "Columns every file from this study has, however a session ends. The study's other columns are left out, since a participant who stops early may never reach the step that writes them.",
        },
      ],
    },
    {
      setting: "Generate Psych-DS metadata",
      value: "on",
      note: "Recommended: DataPipe then files the data the way Psych-DS describes, so others can read it.",
      warning:
        "Decide this before anyone takes part. DataPipe locks it once any data arrives, a pilot " +
        "included, because it decides where files are stored.",
      fields: [],
    },
  ];
}

function partialFilesNote(spec: Spec) {
  return savesAsItGoes(spec)
    ? "This study saves each step as it goes, so DataPipe keeps one .partial.json file for each participant who leaves partway, holding the steps they finished."
    : "This study saves its data once, at the end, so DataPipe gets no .partial.json files: a participant who leaves partway leaves nothing. Saving each step as it is recorded, in the study's Data settings, would keep what they did.";
}

/**
 * What to enter where when setting up the study's experiment on DataPipe, filled in from the study,
 * in DataPipe's own order. The builder and the project download both show it from here.
 */
export function dataPipeSetup(spec: Spec): DataPipeSetup {
  const address = dataPipeAddress(spec.data);
  return {
    address,
    ...(WEB_ADDRESS.test(address) ? { link: address } : {}),
    titles: TITLES,
    storage: STORAGE,
    closedStorage: "OSF no longer takes new experiments.",
    experiment: experimentFields(spec),
    dashboard: dashboardSettings(spec),
    partialFiles: partialFilesNote(spec),
    whereTheIdIs: "DataPipe shows the experiment's ID on its dashboard.",
  };
}

function code(text: string) {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longestRun + 1);
  return longestRun > 0 ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

function fieldLine(field: SetupField) {
  return field.value
    ? `- **${field.label}:** ${code(field.value)}. ${field.note}`
    : `- **${field.label}:** ${field.note}`;
}

function settingSection(setting: DashboardSetting) {
  return [
    `### ${setting.setting}: ${setting.value}`,
    "",
    setting.note,
    ...(setting.warning ? ["", `> **Warning:** ${setting.warning}`] : []),
    ...(setting.fields.length > 0 ? ["", ...setting.fields.map(fieldLine)] : []),
  ].join("\n");
}

/** The setup checklist as a Markdown file for the project download. */
export function dataPipeSetupMarkdown(spec: Spec) {
  const setup = dataPipeSetup(spec);
  const { titles } = setup;
  const experimentId = spec.data?.experiment_id
    ? `This download uploads to the experiment ${code(spec.data.experiment_id)}. If DataPipe gave you a different ID, paste it into “Experiment ID” in the Data section of the builder's Study tab and download the study again.`
    : "Paste it into “Experiment ID” in the Data section of the builder's Study tab, then download the study again.";
  return `# Setting up DataPipe for ${spec.name}

This study uploads its data to DataPipe at ${setup.link ? `<${setup.link}>` : code(setup.address)}. Set up a matching experiment there
before anyone takes part, in DataPipe's own order. The values come from the study as it was when it
was downloaded.

## 1. ${titles.create}

Choose where DataPipe stores the data:

${setup.storage.map((choice) => `- **${choice.name}:** ${choice.note}`).join("\n")}

${setup.closedStorage}

Then fill in:

${setup.experiment.map(fieldLine).join("\n")}

## 2. ${titles.dashboard}

${setup.dashboard.map(settingSection).join("\n\n")}

### ${titles.partialFiles}

${setup.partialFiles}

## 3. ${titles.paste}

${setup.whereTheIdIs} ${experimentId}
`;
}
