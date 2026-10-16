const STORAGE_KEY = "jspsych-studio:panel-widths";
const DEFAULTS = [18, 32, 50];
const MINIMUM = 12;

/** Widths the layout can actually show: one per panel, none too narrow, filling the window. */
export function isLayout(widths: unknown): widths is number[] {
  if (!Array.isArray(widths) || widths.length !== DEFAULTS.length) return false;
  if (!widths.every((width) => typeof width === "number" && width >= MINIMUM)) return false;
  const total = (widths as number[]).reduce((sum, width) => sum + width, 0);
  return Math.abs(total - 100) < 1;
}

function load(): number[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (isLayout(stored)) return stored;
  } catch {
    // A blocked or corrupt store is not worth failing over; the defaults are fine.
  }
  return [...DEFAULTS];
}

export const panels = $state({ widths: load() });

export function resetPanels() {
  panels.widths = [...DEFAULTS];
  save();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panels.widths));
  } catch {
    // Not being able to remember the layout is not a reason to stop resizing it.
  }
}

/**
 * Moves the boundary between two neighbouring panels, taking the space from one and giving it to
 * the other so the row still adds up to the full width.
 */
export function dragBoundary(index: number, deltaPercent: number) {
  const widths = [...panels.widths];
  const left = widths[index] + deltaPercent;
  const right = widths[index + 1] - deltaPercent;
  if (left < MINIMUM || right < MINIMUM) return;
  widths[index] = left;
  widths[index + 1] = right;
  panels.widths = widths;
  save();
}
