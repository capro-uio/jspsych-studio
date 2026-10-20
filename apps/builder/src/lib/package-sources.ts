import { cdnUrl, packageFileKey, type PackageFile } from "@tachisto/compiler";

/** A file's subresource-integrity hash, worked out as a browser does before it runs a script. */
export async function integrityOf(bytes: Uint8Array<ArrayBuffer>) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-384", bytes));
  return `sha384-${btoa(String.fromCharCode(...digest))}`;
}

/**
 * A copy of every file, fetched from unpkg at the version the study was built with and kept only
 * if it matches the hash recorded when Tachisto was built. A download carries these copies, so a
 * file that differs from what was checked is refused rather than handed to participants.
 */
export async function fetchPackageSources(
  files: PackageFile[],
  fetcher: typeof fetch = fetch,
): Promise<Record<string, Uint8Array>> {
  const copies = await Promise.all(
    files.map(async (file) => {
      const key = packageFileKey(file);
      const response = await fetcher(cdnUrl(file));
      if (!response.ok) throw new Error(`could not fetch ${key} (${response.status})`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if ((await integrityOf(bytes)) !== file.integrity) {
        throw new Error(`${key} from unpkg is not the file Tachisto checked, so it was not used`);
      }
      return [key, bytes] as const;
    }),
  );
  return Object.fromEntries(copies);
}

/** The copies as text, for writing scripts and styles into a page. */
export function asText(copies: Record<string, Uint8Array>) {
  const decoder = new TextDecoder();
  return Object.fromEntries(
    Object.entries(copies).map(([key, bytes]) => [key, decoder.decode(bytes)]),
  );
}
