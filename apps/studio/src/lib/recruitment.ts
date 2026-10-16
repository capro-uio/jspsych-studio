import {
  idParamOf,
  PARTICIPANT_PLACEHOLDER,
  RECRUITMENT_PLATFORMS,
} from "@jspsych-studio/compiler";
import type { RecruitmentPlatform, Spec } from "@jspsych-studio/compiler";

interface PlatformGuide {
  label: string;
  urlPlaceholder: string;
  /** What the researcher has to do on the platform's side for the hand-off to work. */
  hint: string;
}

const GUIDES: Record<RecruitmentPlatform, PlatformGuide> = {
  prolific: {
    label: "Prolific",
    urlPlaceholder: "https://app.prolific.com/submissions/complete?cc=…",
    hint:
      "In Prolific, choose to record Prolific IDs through URL parameters, and paste the " +
      "completion URL from the study's completion section.",
  },
  sona: {
    label: "SONA",
    urlPlaceholder: `https://….sona-systems.com/webstudy_credit.aspx?…&survey_code=${PARTICIPANT_PLACEHOLDER}`,
    hint:
      "In SONA, end the study URL with ?id=%SURVEY_CODE%. Paste SONA's completion URL here and " +
      `put ${PARTICIPANT_PLACEHOLDER} after survey_code= in place of the XXXX.`,
  },
  connect: {
    label: "CloudResearch Connect",
    urlPlaceholder: "https://…",
    hint: "Paste the completion redirect URL from the Connect study wizard.",
  },
  custom: {
    label: "Another platform",
    urlPlaceholder: `https://…?id=${PARTICIPANT_PLACEHOLDER}`,
    hint:
      "Name the URL parameter your platform puts the participant's id in, and write " +
      `${PARTICIPANT_PLACEHOLDER} in the return address wherever the platform expects it.`,
  },
};

export const PLATFORMS = RECRUITMENT_PLATFORMS.map((id) => ({ id, ...GUIDES[id] }));

/** A spec written by hand may name no platform; it is then treated as an unnamed one. */
export function guideFor(platform: RecruitmentPlatform | undefined): PlatformGuide | undefined {
  return GUIDES[platform ?? "custom"];
}

/** Switching platform drops any id parameter typed for the last one, and keeps the return address. */
export function choosePlatform(spec: Spec, platform: RecruitmentPlatform | "none") {
  if (platform === "none") {
    delete spec.recruitment;
    return;
  }
  const { id_param: _previous, ...rest } = spec.recruitment ?? {};
  spec.recruitment = { ...rest, platform };
}

/** Typing the platform's own parameter, or nothing, stores nothing, so the field and spec agree. */
export function setIdParam(spec: Spec, value: string) {
  if (!spec.recruitment) return;
  const idParam = value.trim();
  const usual = idParamOf({ platform: spec.recruitment.platform });
  if (idParam && idParam !== usual) spec.recruitment.id_param = idParam;
  else delete spec.recruitment.id_param;
}

export function setCompletionUrl(spec: Spec, value: string) {
  if (!spec.recruitment) return;
  const url = value.trim();
  if (url) spec.recruitment.endings = { complete: { url } };
  else delete spec.recruitment.endings;
}
