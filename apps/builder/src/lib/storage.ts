const PREFIX = "tachisto:";
// The builder was called jsPsych Studio before it became Tachisto, and kept its settings under
// that name.
const LEGACY_PREFIX = "jspsych-studio:";

/** A remembered setting, moving one saved under the old name across the first time it is read. */
export function readStored(name: string): string | null {
  const current = localStorage.getItem(PREFIX + name);
  if (current !== null) return current;
  const legacy = localStorage.getItem(LEGACY_PREFIX + name);
  if (legacy === null) return null;
  localStorage.setItem(PREFIX + name, legacy);
  localStorage.removeItem(LEGACY_PREFIX + name);
  return legacy;
}

export function writeStored(name: string, value: string) {
  localStorage.setItem(PREFIX + name, value);
}
