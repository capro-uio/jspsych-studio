<script lang="ts">
  import { download, specFilename } from "./files.ts";
  import { playback } from "./playback.svelte.ts";
  import { project } from "./project.svelte.ts";
  import { pluginSchema } from "./schemas.ts";
  import {
    activeSegment,
    detailText,
    conditionColumns,
    rowLabels,
    segmentInputs,
    sequenceAt,
    sweepMs,
    timingText,
    type Segment,
  } from "./sequence.ts";
  import {
    sequenceFigure,
    varyingScreens,
    type Arrangement,
    type FigureSize,
  } from "./trial-figure.ts";

  const sequence = $derived(sequenceAt(project.spec, project.selection, pluginSchema));
  const selectedKey = $derived(project.selection?.join(".") ?? "");

  const active = $derived(sequence ? activeSegment(sequence, playback) : -1);
  const sweep = $derived(
    sequence && active !== -1 ? sweepMs(sequence.segments[active], playback.duration) : null,
  );

  const isSelected = (segment: Segment) => segment.path?.join(".") === selectedKey;

  let arrangement = $state<Arrangement>("stack");
  let size = $state<FigureSize>("screen");
  let format = $state<"svg" | "png">("svg");
  let row = $state(0);
  let figureError = $state("");
  const rows = $derived(sequence ? rowLabels(project.spec, sequence.path) : []);
  let byColumn = $state("");
  const columns = $derived(sequence ? conditionColumns(project.spec, sequence.path) : []);
  let figureNote = $state("");
  let progress = $state("");

  // A column edited away is no longer a choice.
  $effect(() => {
    if (byColumn && !columns.some((each) => each.column === byColumn)) byColumn = "";
  });

  const OPTION_LENGTH = 48;
  const optionLabel = (column: string, values: { value: string }[]) => {
    const label = `${column} (${values.map((each) => each.value).join(", ")})`;
    return label.length > OPTION_LENGTH ? `${label.slice(0, OPTION_LENGTH - 1)}…` : label;
  };
  const sequenceKey = $derived(sequence?.path.join(".") ?? "");

  // A row picked for one block means nothing for another, so each starts from its first.
  $effect(() => {
    void sequenceKey;
    row = 0;
    byColumn = "";
    figureError = "";
    figureNote = "";
  });

  // The options close as a menu does: on Escape, or once a click or focus lands elsewhere. The
  // panel's own state is read, not a copy, which would lag a key pressed just after it opens.
  let figurePanel = $state<HTMLDetailsElement>();

  function closeFigureOnEscape(event: KeyboardEvent) {
    if (event.key !== "Escape" || !figurePanel?.open) return;
    figurePanel.open = false;
    figurePanel.querySelector("summary")?.focus();
  }

  function closeFigureOutside(event: Event) {
    if (figurePanel?.open && !figurePanel.contains(event.target as Node | null)) {
      figurePanel.open = false;
    }
  }

  let capturing = $state(false);
  let capture: AbortController | null = null;

  // A capture still running when the strip goes is stopped, and nothing is downloaded.
  $effect(() => () => capture?.abort());

  // The screens are pictured from the running study, for the row chosen, which takes a moment; a
  // figure is still drawn, with plain screens, if they cannot be. The capture's code loads only
  // when it is wanted.
  async function downloadFigure() {
    if (!sequence) return;
    const drawn = sequence;
    const spec = $state.snapshot(project.spec);
    capture = new AbortController();
    const { signal } = capture;
    capturing = true;
    figureError = "";
    try {
      const { captureScreens } = await import("./screen-capture.ts");
      const condition = columns.find((each) => each.column === byColumn);
      // With conditions shown, the sequence is pictured once for each, starting from the first.
      const runs = condition ? condition.values : [{ value: "", row }];
      const pictured: (string | undefined)[][] = [];
      for (const [index, run] of runs.entries()) {
        if (condition) progress = `Picturing ${run.value}, ${index + 1} of ${runs.length}…`;
        pictured.push(await captureScreens(spec, drawn, { row: run.row, signal }).catch(() => []));
        if (signal.aborted) return;
      }
      const conditions = runs.map((run, index) => ({
        label: run.value,
        pictures: pictured[index],
        inputs: segmentInputs(spec, drawn, run.row),
      }));
      figureNote = "";
      if (condition) {
        const varying = varyingScreens(drawn, conditions);
        const shown = varying.filter((index) =>
          conditions.every((each) => each.pictures[index] !== undefined),
        );
        if (varying.length === 0) {
          figureNote = `No screen differs between the values of ${condition.column}.`;
        } else if (shown.length < varying.length) {
          figureNote = "Some screens that differ could not be pictured, so they are left out.";
        }
      }
      const figure = sequenceFigure(
        spec,
        drawn,
        { arrangement, size },
        pictured[0],
        condition && { column: condition.column, conditions },
      );
      const name = `${specFilename(spec)}-${drawn.kind}-${drawn.path.join("-")}`;
      if (format === "svg") {
        download(`${name}.svg`, figure.svg, "image/svg+xml");
        return;
      }
      const { figurePng } = await import("./figure-png.ts");
      const png = await figurePng(figure.svg, figure.pixelWidth);
      if (!signal.aborted) download(`${name}.png`, png, "image/png");
    } catch (error) {
      figureError = `The figure could not be made: ${(error as Error).message}`;
    } finally {
      progress = "";
      capturing = false;
      capture = null;
    }
  }
</script>

<svelte:window
  onkeydown={closeFigureOnEscape}
  onpointerdown={closeFigureOutside}
  onfocusin={closeFigureOutside}
/>

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
      <details class="figure" data-testid="sequence-figure" bind:this={figurePanel}>
        <summary>Figure for a paper</summary>
        <div class="options">
          <label>
            Layout
            <select bind:value={arrangement} data-testid="sequence-figure-layout">
              <option value="stack">Screens stacked</option>
              <option value="row">Screens in a row</option>
            </select>
          </label>
          {#if columns.length > 0}
            <label>
              Show conditions by
              <select
                bind:value={byColumn}
                title="Each condition is pictured from the first row that has its value"
                data-testid="sequence-figure-conditions"
              >
                <option value="">None</option>
                {#each columns as { column, values } (column)}
                  <option value={column}>{optionLabel(column, values)}</option>
                {/each}
              </select>
            </label>
          {/if}
          {#if rows.length > 1 && !byColumn}
            <label>
              Conditions row
              <select bind:value={row} data-testid="sequence-figure-row">
                {#each rows as label, index (index)}
                  <option value={index}>{label}</option>
                {/each}
              </select>
            </label>
          {/if}
          <label>
            Size
            <select bind:value={size} data-testid="sequence-figure-size">
              <option value="screen">As drawn here</option>
              <option value="single">One column, 89 mm</option>
              <option value="double">Two columns, 183 mm</option>
            </select>
          </label>
          <label>
            Format
            <select bind:value={format} data-testid="sequence-figure-format">
              <option value="svg">SVG, to edit</option>
              <option value="png">PNG{size === "screen" ? "" : ", 300 dpi"}</option>
            </select>
          </label>
          <button
            type="button"
            onclick={downloadFigure}
            disabled={sequence.segments.length === 0 || capturing}
            aria-busy={capturing}
            title={sequence.segments.length === 0
              ? "Add a step to this block to draw its figure"
              : "These steps as screens, as the participant sees them"}
            data-testid="download-sequence-figure"
            >{capturing ? progress || "Drawing the screens…" : "Download figure"}</button
          >
          {#if figureNote}
            <p class="figure-note" role="status" data-testid="sequence-figure-note">
              {figureNote}
            </p>
          {/if}
          {#if figureError}
            <p class="figure-error" role="alert" data-testid="sequence-figure-error">
              {figureError}
            </p>
          {/if}
        </div>
      </details>
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
    position: relative;
    font-size: 12px;
  }
  .figure summary {
    cursor: pointer;
    color: var(--ink-muted);
  }
  .figure[open] summary {
    color: var(--ink);
  }
  .options {
    position: absolute;
    right: 0;
    top: calc(100% + var(--space-1));
    z-index: 2;
    display: grid;
    gap: var(--space-2);
    min-width: 16rem;
    padding: var(--space-3);
    background: var(--paper-raised);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-pop);
  }
  .options label {
    display: grid;
    gap: 2px;
    color: var(--ink-muted);
  }
  .options select {
    color: var(--ink);
  }
  .figure-note {
    margin: 0;
    color: var(--ink-muted);
  }
  .figure-error {
    margin: 0;
    color: var(--danger);
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
