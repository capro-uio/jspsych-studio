import { JSPSYCH_URL } from "./metadata.ts";

export type Codemeta = Record<string, unknown>;

export const SPDX_PREFIX = "https://spdx.org/licenses/";

export function withoutMissing<T extends object>(fields: T) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** The fields of the repository's package.json that codemeta also describes. */
export interface PackageManifest {
  description?: string;
  license?: string;
  homepage?: string;
  keywords?: string[];
  repository?: string | { url: string };
  bugs?: string | { url: string };
}

/** What a release decides. */
export interface ReleaseFacts {
  version: string;
  jspsych: string;
  /** Today, as YYYY-MM-DD; only recorded when the version has changed. */
  date: string;
}

function webAddress(field: string | { url: string } | undefined) {
  const url = typeof field === "string" ? field : field?.url;
  return url?.replace(/^git\+/, "").replace(/\.git$/, "");
}

/**
 * codemeta.json brought up to date from package.json and the release. Whatever package.json
 * already says is taken from there, so it is said once; only codemeta's own fields, such as the
 * authors, are written by hand in codemeta.json, and they keep their place and value. The date
 * moves only with the version, so regenerating without a release changes nothing.
 */
export function updateCodemeta(
  existing: Codemeta,
  manifest: PackageManifest,
  release: ReleaseFacts,
): Codemeta {
  const codeRepository = webAddress(manifest.repository);
  const fromManifest = {
    description: manifest.description,
    codeRepository,
    issueTracker: webAddress(manifest.bugs),
    url: manifest.homepage,
    license: manifest.license ? `${SPDX_PREFIX}${manifest.license}` : undefined,
    keywords: manifest.keywords,
  };
  return {
    ...existing,
    ...withoutMissing(fromManifest),
    version: release.version,
    dateModified:
      existing.version !== release.version ? release.date : (existing.dateModified ?? release.date),
    ...(codeRepository
      ? { downloadUrl: `${codeRepository}/releases/tag/v${release.version}` }
      : {}),
    softwareRequirements: [
      {
        "@type": "SoftwareApplication",
        name: "jsPsych",
        version: release.jspsych,
        url: JSPSYCH_URL,
      },
    ],
  };
}
