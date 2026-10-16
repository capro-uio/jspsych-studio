<script lang="ts">
  import { tick } from "svelte";
  import {
    currentTourStep,
    endTour,
    isLastTourStep,
    nextTourStep,
    placeCallout,
    previousTourStep,
    tour,
    tourIsOpen,
    TOUR_HOME_ID,
    TOUR_STEPS,
    visiblePart,
    type Box,
  } from "./tour.svelte.ts";

  const step = $derived(currentTourStep());
  const open = $derived(tourIsOpen());

  let callout: HTMLDivElement | undefined = $state();
  let spot = $state<Box | null>(null);
  let position = $state({ top: 0, left: 0 });

  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
  const sameBox = (a: Box | null, b: Box | null) =>
    a === b ||
    (!!a &&
      !!b &&
      a.top === b.top &&
      a.left === b.left &&
      a.width === b.width &&
      a.height === b.height);

  function measure(target: HTMLElement | null) {
    if (!callout) return;
    const visible = target ? visiblePart(target.getBoundingClientRect(), viewport()) : null;
    const nextSpot = visible && visible.width > 0 && visible.height > 0 ? visible : null;
    const size = callout.getBoundingClientRect();
    const nextPosition = placeCallout(nextSpot, size, viewport());
    if (!sameBox(spot, nextSpot)) spot = nextSpot;
    if (nextPosition.top !== position.top || nextPosition.left !== position.left) {
      position = nextPosition;
    }
  }

  // On a stacked layout the thing being described can be a long way down the page.
  function bringIntoView(target: HTMLElement) {
    const box = target.getBoundingClientRect();
    const fits = box.height < window.innerHeight;
    const outside = box.top < 0 || box.top > window.innerHeight * 0.75;
    if (outside || (fits && box.bottom > window.innerHeight)) {
      target.scrollIntoView({ block: fits ? "center" : "start" });
    }
  }

  // Both ways in disappear once the tour starts, so focus lands where it can be reopened from.
  $effect(() => {
    if (!open) return;
    return () => document.getElementById(TOUR_HOME_ID)?.focus();
  });

  $effect(() => {
    if (!step) return;
    const selector = step.target;
    let target: HTMLElement | null = null;
    let frame = 0;
    // Scrolling and resizing fire far more often than a frame is drawn.
    const remeasure = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure(target);
        });
      }
    };
    let cancelled = false;
    tick().then(() => {
      if (cancelled) return;
      target = selector ? document.querySelector<HTMLElement>(selector) : null;
      if (target) bringIntoView(target);
      measure(target);
      callout?.querySelector<HTMLButtonElement>("[data-tour-next]")?.focus();
    });
    window.addEventListener("resize", remeasure);
    document.addEventListener("scroll", remeasure, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", remeasure);
      document.removeEventListener("scroll", remeasure, true);
    };
  });

  function onkeydown(event: KeyboardEvent) {
    if (!step) return;
    if (event.key === "Escape") endTour();
    else if (event.key === "ArrowRight") nextTourStep();
    else if (event.key === "ArrowLeft") previousTourStep();
    else if (event.key === "Tab") keepFocusInside(event);
    else return;
    event.preventDefault();
  }

  function keepFocusInside(event: KeyboardEvent) {
    const buttons = [
      ...(callout?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
    ];
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const offset = event.shiftKey ? -1 : 1;
    buttons[(current + offset + buttons.length) % buttons.length].focus();
  }
</script>

<svelte:window {onkeydown} />

{#if step}
  <div class="backdrop" class:dimmed={!spot}></div>
  {#if spot}
    <div
      class="spot"
      data-testid="tour-spot"
      style:top={`${spot.top - 4}px`}
      style:left={`${spot.left - 4}px`}
      style:width={`${spot.width + 8}px`}
      style:height={`${spot.height + 8}px`}
    ></div>
  {/if}
  <div
    class="callout"
    role="dialog"
    aria-modal="true"
    aria-labelledby="tour-title"
    aria-describedby="tour-body"
    data-testid="tour"
    data-step={step.id}
    bind:this={callout}
    style:top={`${position.top}px`}
    style:left={`${position.left}px`}
  >
    <p class="count" data-testid="tour-count">{tour.index + 1} of {TOUR_STEPS.length}</p>
    <h2 id="tour-title">{step.title}</h2>
    <p id="tour-body">{step.body}</p>
    <div class="actions">
      <button class="close" data-testid="tour-close" onclick={endTour}>Close</button>
      <span class="spacer"></span>
      <button data-testid="tour-back" disabled={tour.index === 0} onclick={previousTourStep}
        >Back</button
      >
      <button class="next" data-tour-next data-testid="tour-next" onclick={nextTourStep}
        >{isLastTourStep() ? "Done" : "Next"}</button
      >
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
  }
  .backdrop.dimmed {
    background: rgb(0 0 0 / 0.45);
  }
  /* One box whose shadow covers everything else dims the page and leaves a hole over the target. */
  .spot {
    position: fixed;
    z-index: 101;
    border-radius: 6px;
    outline: 2px solid var(--accent);
    box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.45);
    pointer-events: none;
  }
  .callout {
    position: fixed;
    z-index: 102;
    width: min(22rem, calc(100vw - 24px));
    padding: 0.8rem 0.9rem 0.7rem;
    border: 1px solid var(--rule);
    border-radius: 8px;
    background: var(--bg);
    color: var(--fg);
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.25);
  }
  @media (prefers-reduced-motion: no-preference) {
    .spot,
    .callout {
      transition:
        top 0.15s ease,
        left 0.15s ease,
        width 0.15s ease,
        height 0.15s ease;
    }
  }
  .count {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
  h2 {
    margin: 0.15rem 0 0.35rem;
    font-size: 1rem;
  }
  #tour-body {
    margin: 0 0 0.7rem;
    font-size: 0.88rem;
  }
  .actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .spacer {
    flex: 1;
  }
  .close {
    border: 0;
    padding-left: 0;
    color: var(--muted);
  }
  .next {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
