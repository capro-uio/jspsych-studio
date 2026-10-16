export const TABS = [
  { id: "timeline", label: "Timeline" },
  { id: "conditions", label: "Conditions" },
  { id: "files", label: "Files" },
  { id: "study", label: "Study" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

/** Which sidebar tab is open, shared so that more than the tabs themselves can switch it. */
export const ui = $state({ tab: "timeline" as TabId });
