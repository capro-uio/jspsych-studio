import { beforeEach, describe, expect, it } from "vitest";
import { examples } from "../src/lib/examples.ts";
import { loadSpec, project, startNewProject } from "../src/lib/project.svelte.ts";
import {
  TOUR_STEPS,
  currentTourStep,
  endTour,
  nextTourStep,
  placeCallout,
  previousTourStep,
  startTour,
  tour,
  tourIsOpen,
  visiblePart,
} from "../src/lib/tour.svelte.ts";

const VIEWPORT = { width: 1000, height: 800 };
const CALLOUT = { width: 300, height: 150 };

beforeEach(() => {
  endTour();
  startNewProject();
});

describe("startTour", () => {
  it("brings an example along when there is nothing to point at", () => {
    startTour();
    expect(project.spec.name).toBe(examples.find(({ id }) => id === "flanker")!.spec.name);
    expect(project.selection).toEqual([0]);
    expect(currentTourStep()?.id).toBe("welcome");
  });

  it("keeps work that has no steps yet", () => {
    project.spec.name = "my-study";
    project.spec.conditions = { trials: [{ word: "RED" }] };
    startTour();
    expect(project.spec.name).toBe("my-study");
    expect(project.spec.conditions).toEqual({ trials: [{ word: "RED" }] });
    expect(project.selection).toBeNull();
    expect(tourIsOpen()).toBe(true);
  });

  it("leaves an experiment that is already open alone", () => {
    loadSpec(structuredClone(examples[1].spec));
    project.selection = [1];
    startTour();
    expect(project.spec.name).toBe(examples[1].spec.name);
    expect(project.selection).toEqual([1]);
  });

  it("selects a step when none is, so the form has something to show", () => {
    loadSpec(structuredClone(examples[1].spec));
    startTour();
    expect(project.selection).toEqual([0]);
  });
});

describe("moving through the tour", () => {
  it("goes forward and back one step at a time", () => {
    startTour();
    nextTourStep();
    nextTourStep();
    expect(tour.index).toBe(2);
    previousTourStep();
    expect(tour.index).toBe(1);
  });

  it("does not go back past the first step", () => {
    startTour();
    previousTourStep();
    expect(tour.index).toBe(0);
  });

  it("closes after the last step", () => {
    startTour();
    for (let step = 1; step < TOUR_STEPS.length; step += 1) nextTourStep();
    expect(currentTourStep()?.id).toBe(TOUR_STEPS.at(-1)!.id);
    nextTourStep();
    expect(tourIsOpen()).toBe(false);
    expect(currentTourStep()).toBeNull();
  });

  it("can be left at any point", () => {
    startTour();
    nextTourStep();
    endTour();
    expect(tourIsOpen()).toBe(false);
  });

  it("names each step once", () => {
    const ids = TOUR_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("placeCallout", () => {
  it("centres the callout when there is no target", () => {
    expect(placeCallout(null, CALLOUT, VIEWPORT)).toEqual({ top: 325, left: 350 });
  });

  it("puts it below a target with room underneath", () => {
    const target = { top: 20, left: 100, width: 200, height: 30 };
    expect(placeCallout(target, CALLOUT, VIEWPORT)).toEqual({ top: 62, left: 100 });
  });

  it("puts it above a target near the bottom", () => {
    const target = { top: 700, left: 100, width: 200, height: 40 };
    expect(placeCallout(target, CALLOUT, VIEWPORT)).toEqual({ top: 538, left: 100 });
  });

  it("puts it to the right of a tall target on the left", () => {
    const target = { top: 50, left: 0, width: 200, height: 750 };
    expect(placeCallout(target, CALLOUT, VIEWPORT)).toEqual({ top: 50, left: 212 });
  });

  it("puts it to the left of a tall target on the right", () => {
    const target = { top: 50, left: 500, width: 500, height: 750 };
    expect(placeCallout(target, CALLOUT, VIEWPORT)).toEqual({ top: 50, left: 188 });
  });

  it("falls back to the foot of the window when the target fills it", () => {
    const target = { top: 0, left: 0, width: 1000, height: 800 };
    expect(placeCallout(target, CALLOUT, VIEWPORT)).toEqual({ top: 638, left: 350 });
  });

  it("keeps the callout inside the window beside a target at the right edge", () => {
    const target = { top: 20, left: 900, width: 90, height: 30 };
    expect(placeCallout(target, CALLOUT, VIEWPORT).left).toBe(688);
  });
});

describe("visiblePart", () => {
  it("clips a box to the window", () => {
    const box = { top: -50, left: 900, width: 200, height: 300 };
    expect(visiblePart(box, VIEWPORT)).toEqual({ top: 0, left: 900, width: 100, height: 250 });
  });

  it("has no size when the box is out of sight", () => {
    const box = { top: 900, left: 0, width: 100, height: 100 };
    expect(visiblePart(box, VIEWPORT)).toMatchObject({ width: 100, height: 0 });
  });
});
