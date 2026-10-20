import type { SchemaBundle } from "@tachisto/schemas";

/** A file a study's page loads from a package, with the hash any copy of it must match. */
export interface PackageFile {
  package: string;
  version: string;
  /** Where the file sits inside the package. */
  path: string;
  /** Its subresource-integrity hash, as a browser checks it. */
  integrity: string;
}

/** Where a package file goes in a download that carries its own copies: `<package>/<path>`. */
export const packageFileKey = (file: Pick<PackageFile, "package" | "path">) =>
  `${file.package}/${file.path}`;

const CDN = "https://unpkg.com";

/** Where unpkg serves a package file, at exactly the version the study was built with. */
export const cdnUrl = (file: Pick<PackageFile, "package" | "version" | "path">) =>
  `${CDN}/${file.package}@${file.version}/${file.path}`;

/**
 * Every file the bundle records for these packages. A package the bundle has no files for, or
 * records at another version than the study asks for, means the bundle is out of date, which
 * would put the wrong file in a download, so it stops the compile.
 */
export function filesOfPackages(
  bundle: SchemaBundle,
  wanted: { name: string; version: string }[],
): PackageFile[] {
  const seen = new Set<string>();
  return wanted.flatMap(({ name, version }) => {
    if (seen.has(name)) return [];
    seen.add(name);
    const recorded = bundle.packages[name];
    if (!recorded) throw new Error(`the schema bundle records no files for ${name}`);
    if (recorded.version !== version) {
      throw new Error(
        `the schema bundle records ${name} ${recorded.version}, but the study uses ${version}`,
      );
    }
    return Object.entries(recorded.files).map(([path, integrity]) => ({
      package: name,
      version,
      path,
      integrity,
    }));
  });
}
