import { readStored, writeStored } from "./storage.ts";

const STORAGE_KEY = "self-contained";

function stored() {
  try {
    return readStored(STORAGE_KEY) !== "false";
  } catch {
    // Blocked storage is no reason to refuse to download.
    return true;
  }
}

/**
 * Whether downloads carry their own copy of jsPsych and its plugins. On unless turned off: a
 * study that loads nothing from elsewhere keeps running whatever happens to a CDN.
 */
export const downloads = $state({ selfContained: stored() });

export function setSelfContained(selfContained: boolean) {
  downloads.selfContained = selfContained;
  try {
    writeStored(STORAGE_KEY, String(selfContained));
  } catch {
    // Not remembering the choice is better than failing to make it.
  }
}
