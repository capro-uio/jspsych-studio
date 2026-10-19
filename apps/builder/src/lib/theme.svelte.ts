import { readStored, writeStored } from "./storage.ts";

const STORAGE_KEY = "theme";

export type Theme = "system" | "light" | "dark";

function stored(): Theme {
  try {
    const value = readStored(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // Blocked storage is no reason to refuse to render.
  }
  return "system";
}

export const theme = $state({ choice: stored() });

/** Written to the document so CSS can honour a choice that overrides the system setting. */
export function applyTheme() {
  const root = document.documentElement;
  if (theme.choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme.choice);
}

export function setTheme(choice: Theme) {
  theme.choice = choice;
  applyTheme();
  try {
    writeStored(STORAGE_KEY, choice);
  } catch {
    // Not remembering the choice is better than failing to make it.
  }
}
