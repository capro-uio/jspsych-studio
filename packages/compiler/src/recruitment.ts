import type { Problem } from "./validate.ts";
import type { RecruitmentPlatform, RecruitmentSettings, Spec } from "./types.ts";

export const PARTICIPANT_PLACEHOLDER = "{participant_id}";
export const DEFAULT_ID_PARAM = "participant_id";
/** Return addresses must be https; the schema and the validator share this pattern. */
export const SECURE_URL_PATTERN = "^https://";

/** The URL parameter each platform passes the participant's id in, unless the spec says otherwise. */
export const PLATFORM_ID_PARAMS: Record<RecruitmentPlatform, string> = {
  prolific: "PROLIFIC_PID",
  sona: "id",
  connect: "participantId",
  custom: DEFAULT_ID_PARAM,
};

export const RECRUITMENT_PLATFORMS = Object.keys(PLATFORM_ID_PARAMS) as RecruitmentPlatform[];

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

export function completionUrlOf(recruitment: RecruitmentSettings | undefined) {
  return recruitment?.endings?.complete?.url;
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

// The compiler never runs the JSON Schema, so a hand-edited spec reaches these checks unfiltered.
export function recruitmentProblems(spec: Spec): Problem[] {
  const recruitment = spec.recruitment;
  if (!recruitment) return [];
  const problems: Problem[] = [];
  if (recruitment.platform !== undefined && !isPlatform(recruitment.platform)) {
    problems.push({ message: `recruitment names an unknown platform "${recruitment.platform}"` });
  }
  const endings: unknown = recruitment.endings ?? {};
  if (typeof endings !== "object" || endings === null || Array.isArray(endings)) {
    return [...problems, { message: "recruitment endings must be a set of named endings" }];
  }
  for (const [name, ending] of Object.entries(endings)) {
    if (name !== "complete") {
      problems.push({ message: `"${name}" is not an ending the study has; only "complete" is` });
      continue;
    }
    const problem = returnAddressProblem((ending as { url?: unknown } | null)?.url);
    if (problem) problems.push({ message: `the "${name}" ending ${problem}` });
  }
  // A download stays on the participant's computer, and leaving the page can cut it off.
  if ("complete" in endings && spec.data?.save !== "post") {
    problems.push({
      message: "sending participants back to a recruitment platform needs data uploaded first",
    });
  }
  return problems;
}
