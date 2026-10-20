import { examples } from "./examples.ts";
import { isUntouched, openExample, project } from "./project.svelte.ts";
import { ui, type TabId } from "./ui.svelte.ts";

export interface TourStep {
  id: string;
  /** What to point at; a step without one is shown in the middle of the window. */
  target?: string;
  /** The sidebar tab that has to be open for the target to be there. */
  tab?: TabId;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "A quick look around",
    body:
      "You build an experiment here from forms, and Tachisto turns it into jsPsych code you " +
      "can host anywhere. This takes about a minute. Press Esc to leave at any point.",
  },
  {
    id: "name",
    target: '[data-testid="experiment-name"]',
    title: "Name it",
    body: "The name is what your downloaded files are called.",
  },
  {
    id: "timeline",
    target: "aside .panel",
    tab: "timeline",
    title: "The timeline",
    body:
      "Steps run from top to bottom. Use + to add one: a trial shows something and collects a " +
      "response, a block repeats its steps once per row of a conditions table, a loop repeats " +
      "until performance is good enough, and splits and branches send participants down " +
      "different paths. The arrows move a step; clicking one opens it.",
  },
  {
    id: "form",
    target: ".form",
    tab: "timeline",
    title: "The selected step",
    body:
      "Everything about the selected step. The fields come from the jsPsych plugin itself, " +
      "documentation included. Any field can take a fixed value or read from a conditions " +
      "column, and “show all” reveals the ones you rarely need.",
  },
  {
    id: "conditions",
    target: "aside .panel",
    tab: "conditions",
    title: "Conditions",
    body:
      "A conditions table has one row per kind of trial. Build one from factors to get every " +
      "combination, or paste CSV from a spreadsheet. A block runs its steps once per row.",
  },
  {
    id: "files",
    target: "aside .panel",
    tab: "files",
    title: "Files",
    body:
      "Images, sounds and video your steps show. They travel inside the project, so nothing " +
      "goes missing when you download it.",
  },
  {
    id: "study",
    target: "aside .panel",
    tab: "study",
    title: "The study",
    body:
      "Who made it, where results go, which platform participants come from, and settings that " +
      "apply to every step. Until you choose where data goes, a dot on this tab reminds you " +
      "that nothing is being kept.",
  },
  {
    id: "preview",
    target: ".preview",
    tab: "timeline",
    title: "Try it",
    body:
      "The preview runs the experiment as a participant sees it: all of it, or only the " +
      "selected step. Click into it before answering with keys. Nothing is saved from here, " +
      "and Code shows the jsPsych it compiles to.",
  },
  {
    id: "download",
    target: '[data-testid="download-zip"]',
    title: "Take it with you",
    body:
      "Download experiment gives you a folder ready to put on any web server. The ⋯ menu has a " +
      "single HTML file, the project file on its own, opening a saved project, and this tour.",
  },
];

/** The control the tour can be reopened from, which takes focus when the tour closes. */
export const TOUR_HOME_ID = "more-actions";

export const tour = $state({ index: -1 });

export function tourIsOpen() {
  return tour.index >= 0;
}

export function currentTourStep(): TourStep | null {
  return TOUR_STEPS[tour.index] ?? null;
}

export function isLastTourStep() {
  return tour.index === TOUR_STEPS.length - 1;
}

// The panel a step points at only exists while its tab is open.
function showStep(index: number) {
  tour.index = index;
  const wanted = TOUR_STEPS[index].tab;
  if (wanted) ui.tab = wanted;
}

const TOUR_EXAMPLE = "flanker";

/**
 * A fresh project has nothing to point at, so the tour brings an example along. Anything already
 * started is left as it is, apart from selecting a step so the form has something to show.
 */
export function startTour() {
  if (isUntouched()) {
    openExample(examples.find(({ id }) => id === TOUR_EXAMPLE)!.spec);
  }
  if (!project.selection && project.spec.timeline.length > 0) project.selection = [0];
  showStep(0);
}

export function nextTourStep() {
  if (isLastTourStep()) endTour();
  else showStep(tour.index + 1);
}

export function previousTourStep() {
  if (tour.index > 0) showStep(tour.index - 1);
}

export function endTour() {
  tour.index = -1;
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MARGIN = 12;

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));

/**
 * Where the callout goes: beside the highlighted target on whichever side has room, in the
 * order below, above, right, left. A target too big for any of those, such as a panel filling a
 * phone screen, gets the callout along the foot of the window, where the top of it stays visible.
 */
export function placeCallout(
  target: Box | null,
  callout: { width: number; height: number },
  viewport: { width: number; height: number },
): { top: number; left: number } {
  const across = (preferred: number) =>
    clamp(preferred, MARGIN, viewport.width - callout.width - MARGIN);
  const down = (preferred: number) =>
    clamp(preferred, MARGIN, viewport.height - callout.height - MARGIN);

  if (!target) {
    return {
      top: down((viewport.height - callout.height) / 2),
      left: across((viewport.width - callout.width) / 2),
    };
  }

  const below = target.top + target.height + MARGIN;
  if (below + callout.height <= viewport.height - MARGIN) {
    return { top: below, left: across(target.left) };
  }
  const above = target.top - MARGIN - callout.height;
  if (above >= MARGIN) return { top: above, left: across(target.left) };

  const right = target.left + target.width + MARGIN;
  if (right + callout.width <= viewport.width - MARGIN) {
    return { top: down(target.top), left: right };
  }
  const left = target.left - MARGIN - callout.width;
  if (left >= MARGIN) return { top: down(target.top), left };

  return {
    top: viewport.height - callout.height - MARGIN,
    left: across((viewport.width - callout.width) / 2),
  };
}

/** The part of a box inside the window, so a highlight never points past the edge. */
export function visiblePart(box: Box, viewport: { width: number; height: number }): Box {
  const top = Math.max(box.top, 0);
  const left = Math.max(box.left, 0);
  const bottom = Math.min(box.top + box.height, viewport.height);
  const right = Math.min(box.left + box.width, viewport.width);
  return { top, left, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) };
}
