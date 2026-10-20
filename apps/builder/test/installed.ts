import { readFileSync } from "node:fs";
import { join } from "node:path";

const NODE_MODULES = join(import.meta.dirname, "..", "..", "..", "node_modules");

/** The installed copy of a file unpkg serves, which is byte for byte the same. */
export function installedCopy(url: string) {
  const match = /^https:\/\/unpkg\.com\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.+)$/.exec(url);
  if (!match) throw new Error(`not an unpkg address: ${url}`);
  return new Uint8Array(readFileSync(join(NODE_MODULES, match[1], match[2])));
}

/** A fetch that answers from the installed packages instead of the network. */
export const installedFetch = ((url: string) =>
  Promise.resolve(new Response(installedCopy(url)))) as unknown as typeof fetch;
