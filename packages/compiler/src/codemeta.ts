import { GENERATOR_URL, JSPSYCH_URL } from "./metadata.ts";

export type Codemeta = Record<string, unknown>;

/** What a release decides; everything else in codemeta.json is written by hand. */
export interface ReleaseFacts {
  version: string;
  jspsych: string;
  /** Today, as YYYY-MM-DD; only recorded when the version has changed. */
  date: string;
}

/**
 * codemeta.json with the fields a release decides brought up to date. The hand-written fields keep
 * their place and value, and the date moves only with the version, so regenerating without a
 * release changes nothing.
 */
export function updateCodemeta(existing: Codemeta, facts: ReleaseFacts): Codemeta {
  const released = existing.version !== facts.version;
  return {
    ...existing,
    version: facts.version,
    dateModified: released ? facts.date : (existing.dateModified ?? facts.date),
    downloadUrl: `${GENERATOR_URL}/releases/tag/v${facts.version}`,
    softwareRequirements: [
      { "@type": "SoftwareApplication", name: "jsPsych", version: facts.jspsych, url: JSPSYCH_URL },
    ],
  };
}
