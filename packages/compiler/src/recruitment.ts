import type { Problem } from "./validate.ts";
import type { Ending, RecruitmentPlatform, RecruitmentSettings, Retention, Spec } from "./types.ts";

/** What an ending can keep, from everything down to nothing. */
export const RETENTIONS: Retention[] = ["all", "checkpoint", "nothing"];

export const PARTICIPANT_PLACEHOLDER = "{participant_id}";
export const DEFAULT_ID_PARAM = "participant_id";
/** Return addresses must be https; the schema and the validator share this pattern. */
export const SECURE_URL_PATTERN = "^https://";
/** Ending names become a data value and a key in the spec; the schema shares this pattern. */
export const ENDING_NAME_PATTERN = "^[A-Za-z][A-Za-z0-9_-]*$";
/** A message needs something to read, not only spaces. */
export const VISIBLE_TEXT_PATTERN = "\\S";

const ENDING_NAME = new RegExp(ENDING_NAME_PATTERN);

export function isEndingName(name: string) {
  return ENDING_NAME.test(name);
}

/** The URL parameter each platform passes the participant's id in, unless the spec says otherwise. */
export const PLATFORM_ID_PARAMS: Record<RecruitmentPlatform, string> = {
  prolific: "PROLIFIC_PID",
  sona: "id",
  connect: "participantId",
  custom: DEFAULT_ID_PARAM,
};

export const RECRUITMENT_PLATFORMS = Object.keys(PLATFORM_ID_PARAMS) as RecruitmentPlatform[];

// What else each platform adds to the study link by default, which the study records with every
// row. Prolific documents STUDY_ID and SESSION_ID; Connect sends assignmentId and projectId; SONA
// sends only the code its researcher names.
const PLATFORM_EXTRA_PARAMS: Record<RecruitmentPlatform, string[]> = {
  prolific: ["STUDY_ID", "SESSION_ID"],
  sona: [],
  connect: ["assignmentId", "projectId"],
  custom: [],
};

/** The link parameters the study expects from its platform: the participant's id, and the rest. */
export function linkParamsOf(recruitment: RecruitmentSettings | undefined) {
  const extra = isPlatform(recruitment?.platform)
    ? PLATFORM_EXTRA_PARAMS[recruitment.platform]
    : [];
  return [idParamOf(recruitment), ...extra];
}

function isPlatform(value: unknown): value is RecruitmentPlatform {
  return typeof value === "string" && Object.hasOwn(PLATFORM_ID_PARAMS, value);
}

/** The URL parameter the participant's id arrives in. */
export function idParamOf(recruitment: RecruitmentSettings | undefined) {
  if (recruitment?.id_param) return recruitment.id_param;
  return isPlatform(recruitment?.platform)
    ? PLATFORM_ID_PARAMS[recruitment.platform]
    : DEFAULT_ID_PARAM;
}

/** The ending reached once every step has run. */
export const COMPLETE_ENDING = "complete";

export function endingOf(recruitment: RecruitmentSettings | undefined, name: string) {
  const endings = recruitment?.endings;
  return endings && Object.hasOwn(endings, name) ? endings[name] : undefined;
}

export function completionUrlOf(recruitment: RecruitmentSettings | undefined) {
  return endingOf(recruitment, COMPLETE_ENDING)?.url;
}

export function endingNames(recruitment: RecruitmentSettings | undefined) {
  const endings: unknown = recruitment?.endings;
  return isEndingSet(endings) ? Object.keys(endings) : [];
}

/** Whether the experiment reads the participant's id: to file their data, or to send them back. */
export function needsParticipantId(spec: Spec) {
  const endings: unknown[] = Object.values(spec.recruitment?.endings ?? {});
  return (
    spec.data !== undefined || endings.some((ending) => isEndingSet(ending) && "url" in ending)
  );
}

/** What an ending keeps; everything unless it says otherwise. */
export function retentionOf(ending: Ending | undefined): Retention {
  return ending?.keep ?? "all";
}

/** The endings an end step can reach before the study is complete. */
export function earlyEndingNames(recruitment: RecruitmentSettings | undefined) {
  return endingNames(recruitment).filter((name) => name !== COMPLETE_ENDING);
}

function isEndingSet(endings: unknown): endings is Record<string, unknown> {
  return typeof endings === "object" && endings !== null && !Array.isArray(endings);
}

const SECURE_URL = new RegExp(SECURE_URL_PATTERN);

// The id is the participant's to choose, so it may only land in the path or query: an address
// whose origin changes with the id would let a participant send themselves anywhere.
function returnAddressProblem(template: unknown) {
  if (typeof template !== "string" || !SECURE_URL.test(template)) {
    return "needs a web address starting https://";
  }
  try {
    const [first, second] = ["a", "b"].map(
      (id) => new URL(template.replaceAll(PARTICIPANT_PLACEHOLDER, id)).origin,
    );
    if (first !== second) return `can only use ${PARTICIPANT_PLACEHOLDER} after the domain`;
  } catch {
    return "is not a web address a browser can open";
  }
  return undefined;
}

function isSampleSize(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

/** How many participants the study plans to recruit, when it says so as a whole number above 0. */
export function sampleSizeOf(spec: Spec) {
  return isSampleSize(spec.sample_size) ? spec.sample_size : undefined;
}

export function sampleSizeProblems(spec: Spec): Problem[] {
  if (spec.sample_size === undefined || isSampleSize(spec.sample_size)) return [];
  return [
    {
      message: `sample_size is ${JSON.stringify(spec.sample_size)}, which is not a whole number of participants above 0`,
      severity: "error",
    },
  ];
}

// The compiler never runs the JSON Schema, so a hand-edited spec reaches these checks unfiltered.
export function recruitmentProblems(spec: Spec): Problem[] {
  const recruitment = spec.recruitment;
  if (!recruitment) return [];
  const problems: Problem[] = [];
  if (recruitment.platform !== undefined && !isPlatform(recruitment.platform)) {
    problems.push({
      message: `recruitment names an unknown platform "${String(recruitment.platform)}"`,
      severity: "error",
    });
  }
  const endings: unknown = recruitment.endings ?? {};
  if (!isEndingSet(endings)) {
    return [
      ...problems,
      { message: "recruitment endings must be a set of named endings", severity: "error" },
    ];
  }
  let redirectsAfterSaving = false;
  for (const [name, ending] of Object.entries(endings)) {
    const problem = endingProblem(name, ending);
    if (problem) problems.push({ message: problem, severity: "error" });
    if (isEndingSet(ending) && ending.url !== undefined && ending.keep !== "nothing") {
      redirectsAfterSaving = true;
    }
  }
  // A download stays on the participant's computer, and leaving the page can cut it off. An
  // ending that keeps nothing has nothing to lose.
  if (redirectsAfterSaving && spec.data?.save !== "post") {
    problems.push({
      message: "sending participants back to a recruitment platform needs data uploaded first",
      severity: "error",
    });
  }
  return problems;
}

function endingProblem(name: string, ending: unknown) {
  const where = `the "${name}" ending`;
  if (!isEndingName(name)) {
    return `${where} needs a name that starts with a letter and has only letters, digits, - and _`;
  }
  if (!isEndingSet(ending) || (ending.url === undefined && ending.message === undefined)) {
    return `${where} needs a web address starting https:// or a message`;
  }
  if (ending.keep !== undefined && !RETENTIONS.includes(ending.keep as Retention)) {
    return `${where} keeps ${RETENTIONS.map((keep) => `"${keep}"`).join(", ")}, not ${JSON.stringify(ending.keep)}`;
  }
  if (name === COMPLETE_ENDING && (ending.keep ?? "all") !== "all") {
    return `${where} keeps all the data; only an early ending can keep less`;
  }
  if (ending.url !== undefined && ending.message !== undefined) {
    return `${where} sends the participant away or shows a message, not both`;
  }
  if (ending.message !== undefined) {
    return typeof ending.message === "string" && ending.message.trim()
      ? undefined
      : `${where} needs a message to show`;
  }
  const problem = returnAddressProblem(ending.url);
  return problem ? `${where} ${problem}` : undefined;
}
