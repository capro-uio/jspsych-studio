const STORAGE_KEY = "jspsych-studio:panel-widths";
const DEFAULTS = [18, 32, 50];
const MINIMUM = 12;

function load(): number[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(stored) && stored.length === DEFAULTS.length) return stored as number[];
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
