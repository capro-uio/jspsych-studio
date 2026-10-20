<script lang="ts">
  import { download, specFilename } from "./files.ts";
  import { playback } from "./playback.svelte.ts";
  import { project } from "./project.svelte.ts";
  import { pluginSchema } from "./schemas.ts";
  import {
    activeSegment,
    detailText,
    sequenceAt,
    sweepMs,
    timingText,
    type Segment,
  } from "./sequence.ts";
  import { sequenceFigure, type Arrangement } from "./trial-figure.ts";

  const sequence = $derived(sequenceAt(project.spec, project.selection, pluginSchema));
  const selectedKey = $derived(project.selection?.join(".") ?? "");

  const active = $derived(sequence ? activeSegment(sequence, playback) : -1);
  const sweep = $derived(
    sequence && active !== -1 ? sweepMs(sequence.segments[active], playback.duration) : null,
  );

  const isSelected = (segment: Segment) => segment.path?.join(".") === selectedKey;

  let arrangement = $state<Arrangement>("stack");

  function downloadFigure() {
    if (!sequence) return;
    download(
      `${specFilename(project.spec)}-${sequence.kind}-${sequence.path.join("-")}.svg`,
      sequenceFigure(project.spec, sequence, arrangement),
      "image/svg+xml",
    );
  }
</script>

{#if sequence}
  <section
    class="sequence"
    data-testid="sequence"
    aria-label={`Timing of the steps in this ${sequence.kind}`}
  >
    <div class="heading">
      <p class="caption">
        One pass through this {sequence.kind === "block" ? "block" : "loop"}
        {#if active !== -1}<span class="live" data-testid="sequence-live"
            >· following the preview</span
          >{/if}
      </p>
      <div class="figure" role="group" aria-label="Figure for a paper">
        <select
          bind:value={arrangement}
          aria-label="Figure layout"
          data-testid="sequence-figure-layout"
        >
          <option value="stack">Screens stacked</option>
          <option value="row">Screens in a row</option>
        </select>
        <button
          type="button"
          onclick={downloadFigure}
          disabled={sequence.segments.length === 0}
          title={sequence.segments.length === 0
            ? "Add a step to this block to draw its figure"
            : "An SVG of these steps as screens, for a paper or poster"}
          data-testid="download-sequence-svg">Download figure</button
        >
      </div>
    </div>
    <p class="visually-hidden" aria-live="polite" data-testid="sequence-now">
      {active !== -1 ? `Now: ${sequence.segments[active].title}` : ""}
    </p>
    {#if sequence.segments.length === 0}
      <p class="empty" data-testid="sequence-empty">
        No steps in this {sequence.kind} yet.
      </p>
    {/if}
    <ol class="track">
      {#each sequence.segments as segment, index (index)}
        {@const timing = timingText(segment)}
        {@const detail = detailText(segment)}
        {@const selected = isSelected(segment)}
        <li
          class="segment {segment.role}"
          class:selected
          class:active={index === active}
          style={`flex-grow: ${segment.weight}`}
          data-testid={segment.path ? `sequence-${segment.path.join("-")}` : "sequence-gap"}
        >
          {#if segment.path}
            {@const path = segment.path}
            <button
              class="block"
              title={`${segment.title}: ${timing || "select to edit"}`}
              aria-current={selected ? "true" : undefined}
              onclick={() => (project.selection = path)}
            >
              {#if segment.role === "fixation"}<span class="cross" aria-hidden="true"></span>{/if}
              <span class="name">{segment.title}</span>
            </button>
          {:else}
            <span class="block"><span class="name">{segment.title}</span></span>
          {/if}
          {#if index === active}
            <span class="lane" aria-hidden="true">
              {#key playback.run}
                <span
                  class="playhead"
                  class:sweeping={sweep !== null}
                  style={sweep !== null ? `animation-duration: ${sweep}ms` : undefined}
                ></span>
              {/key}
            </span>
          {/if}
          <span class="timing">{timing}</span>
          {#if detail}
            <span class="detail">{detail}</span>
          {/if}
        </li>
      {/each}
    </ol>
  </section>
{/if}

<style>
  .sequence {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-bottom: var(--space-3);
    margin-bottom: var(--space-3);
    border-bottom: 1px solid var(--line);
  }
  .heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .figure {
    display: flex;
    gap: var(--space-1);
    font-size: 12px;
  }
  .empty {
    margin: 0;
    font-size: 12px;
    color: var(--ink-muted);
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .caption {
    margin: 0;
    font-size: 12px;
    line-height: 16px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .live {
    color: var(--stimulus-text);
  }
  .track {
    display: flex;
    gap: var(--space-1);
    margin: 0;
    padding: var(--space-2);
    list-style: none;
    background: var(--paper-sunk);
    border-radius: var(--radius-md);
    overflow-x: auto;
  }
  .segment {
    position: relative;
    flex-basis: 0;
    min-width: 5.5rem;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .block {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    width: 100%;
    padding: 0 var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    font-size: 11px;
    line-height: 16px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-align: left;
    overflow: hidden;
  }
  .name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .fixation .block,
  .screen .block,
  .other .block {
    background: var(--paper-raised);
    color: var(--ink);
  }
  .other .block {
    border: 1px dashed var(--line-strong);
  }
  .stimulus .block {
    background: var(--stimulus-fill);
    color: var(--on-stimulus);
  }
  .gap .block {
    background: var(--mask);
    color: var(--ink);
  }
  .group .block {
    background: transparent;
    border: 1px solid var(--line-strong);
    color: var(--ink-muted);
  }
  button.block:hover {
    border-color: var(--line-strong);
  }
  .selected .block {
    outline: 2px solid var(--ink);
    outline-offset: 1px;
  }
  .cross {
    position: relative;
    flex: none;
    width: 10px;
    height: 10px;
  }
  .cross::before,
  .cross::after {
    content: "";
    position: absolute;
    background: currentColor;
  }
  .cross::before {
    left: 4px;
    top: 0;
    width: 2px;
    height: 10px;
  }
  .cross::after {
    top: 4px;
    left: 0;
    height: 2px;
    width: 10px;
  }
  .timing,
  .detail {
    padding-left: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--ink-muted);
  }
  .timing {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .detail {
    font-size: 12px;
  }
  /* The lane covers the block, so the playhead crosses it by its own width, a transform alone. */
  .lane {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 36px;
    overflow: hidden;
    pointer-events: none;
  }
  .playhead {
    position: absolute;
    inset: 0;
    border-right: 2px solid var(--stimulus);
    translate: calc(2px - 100%);
  }
  .playhead.sweeping {
    animation-name: sweep;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }
  @keyframes sweep {
    to {
      translate: 0;
    }
  }
  .stimulus .playhead {
    border-right-color: var(--on-stimulus);
  }
  /* A bar under the block says which step is on screen, with motion or without. */
  .active::before {
    content: "";
    position: absolute;
    top: 38px;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--stimulus);
  }
  @media (prefers-reduced-motion: reduce) {
    .playhead.sweeping {
      animation: none;
    }
  }
</style>
