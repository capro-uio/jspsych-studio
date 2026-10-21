<script lang="ts">
  import {
    centred,
    cornerRadius,
    decisionOutline,
    edgePath,
    layoutFlow,
    lineY,
    textX,
    type FlowBox,
  } from "./flow.ts";
  import { figureChoices } from "./figure-choices.svelte.ts";
  import { saveFigure } from "./figure-download.ts";
  import { specFilename } from "./files.ts";
  import { flowFigure } from "./flow-figure.ts";
  import { exportedSpec, project } from "./project.svelte.ts";
  import { ui } from "./ui.svelte.ts";

  const layout = $derived(layoutFlow(project.spec));
  const selectionKey = $derived(project.selection?.join(".") ?? null);

  function select(box: FlowBox) {
    if (!box.path) return;
    project.selection = [...box.path];
    ui.tab = "timeline";
  }

  function onKeydown(event: KeyboardEvent, box: FlowBox) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    select(box);
  }

  let downloadError = $state("");

  // Made at the size and in the format chosen in the Figures view, like every other figure.
  async function downloadFigure() {
    downloadError = "";
    const spec = $state.snapshot(exportedSpec());
    const { svg, pixelWidth } = flowFigure(spec, figureChoices.size);
    await saveFigure(`${specFilename(spec)}-flow`, svg, pixelWidth, figureChoices.format).catch(
      (error: Error) => (downloadError = `The figure could not be made: ${error.message}`),
    );
  }
</script>

<div class="flow" data-testid="flow">
  <div class="bar">
    <p class="hint" id="flow-hint">How the study runs, top to bottom. Select a step to edit it.</p>
    <button
      type="button"
      onclick={downloadFigure}
      title="For a paper or poster, made at the size and in the format chosen under Figures"
      data-testid="download-flow-svg"
      >Download as {figureChoices.format === "svg" ? "SVG" : "PNG"}</button
    >
  </div>
  {#if downloadError}
    <p class="error" role="alert">{downloadError}</p>
  {/if}
  <svg
    width={layout.width}
    height={layout.height}
    viewBox={`0 0 ${layout.width} ${layout.height}`}
    role="group"
    aria-label="Study flow diagram"
    aria-describedby="flow-hint"
    data-testid="flow-diagram"
  >
    <defs>
      <marker
        id="flow-arrow"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path class="arrowhead" d="M 0 0 L 10 5 L 0 10 z" />
      </marker>
    </defs>

    {#snippet boxContent(box: FlowBox)}
      <title>{box.label}</title>
      {#if box.shape === "decision"}
        <path class="outline" d={decisionOutline(box)} />
      {:else}
        <rect
          class="outline"
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          rx={cornerRadius(box)}
        />
      {/if}
      <text text-anchor={centred(box) ? "middle" : "start"} aria-hidden="true">
        {#each box.title as line, index (index)}
          <tspan class="title" x={textX(box)} y={lineY(box, index)}>{line}</tspan>
        {/each}
        {#each box.details as line, index (index)}
          <tspan class="detail" x={textX(box)} y={lineY(box, box.title.length + index)}
            >{line}</tspan
          >
        {/each}
      </text>
    {/snippet}

    {#each layout.boxes as box (box.key)}
      {#if box.path}
        {@const selected = box.path.join(".") === selectionKey}
        <g
          class={`box interactive shape-${box.shape} kind-${box.kind}`}
          class:selected
          data-testid={`flow-${box.key}`}
          role="button"
          tabindex="0"
          aria-label={box.label}
          aria-current={selected ? "true" : undefined}
          onclick={() => select(box)}
          onkeydown={(event) => onKeydown(event, box)}
        >
          {@render boxContent(box)}
        </g>
      {:else}
        <g
          class={`box shape-${box.shape} kind-${box.kind}`}
          data-testid={`flow-${box.key}`}
          role="img"
          aria-label={box.label}
        >
          {@render boxContent(box)}
        </g>
      {/if}
    {/each}

    <g class="edges" aria-hidden="true">
      {#each layout.edges as edge, index (index)}
        <path
          class="edge"
          class:repeat={edge.repeat}
          d={edgePath(edge)}
          marker-end={edge.arrow ? "url(#flow-arrow)" : undefined}
          data-testid={edge.repeat ? "flow-repeat" : undefined}
        />
        {#if edge.label && edge.labelAt}
          <text class="edge-label" x={edge.labelAt.x} y={edge.labelAt.y} text-anchor="middle"
            >{edge.label}</text
          >
        {/if}
      {/each}
    </g>
  </svg>
</div>

<style>
  .flow {
    flex: 1;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    padding: 0.4rem;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin: 0 0 0.3rem;
  }
  .bar button {
    flex: none;
    font-size: 0.78rem;
  }
  .error {
    margin: 0 0 0.3rem;
    font-size: 0.78rem;
    color: var(--danger);
  }
  .hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-muted);
  }
  svg {
    display: block;
    margin: 0 auto;
    font-size: 12px;
  }
  .outline {
    fill: var(--paper-raised);
    stroke: var(--line-strong);
    stroke-width: 1.25;
  }
  .shape-frame .outline {
    fill: var(--paper-sunk);
  }
  .shape-decision .outline {
    fill: var(--flow-split-fill);
    stroke: var(--flow-split-stroke);
  }
  .shape-marker .outline {
    fill: var(--flow-checkpoint-fill);
    stroke: var(--flow-checkpoint-stroke);
  }
  .shape-lane .outline {
    fill: var(--paper);
    stroke: var(--flow-split-stroke);
    stroke-dasharray: 3 3;
  }
  .shape-empty .outline {
    fill: none;
    stroke: var(--line);
    stroke-dasharray: 4 3;
  }
  .shape-terminal .outline {
    fill: var(--paper);
    stroke: var(--ink);
  }
  .kind-block .outline {
    fill: var(--flow-block-fill);
    stroke: var(--flow-block-stroke);
  }
  .kind-loop .outline {
    fill: var(--flow-loop-fill);
    stroke: var(--flow-loop-stroke);
  }
  text {
    fill: var(--ink);
  }
  .title {
    font-weight: 600;
  }
  .detail {
    fill: var(--ink-muted);
  }
  .shape-empty text {
    fill: var(--ink-muted);
    font-style: italic;
  }
  .interactive {
    cursor: pointer;
  }
  .interactive:hover .outline {
    stroke: var(--line-strong);
  }
  .interactive:focus {
    outline: none;
  }
  .interactive:focus-visible .outline {
    stroke: var(--signal);
    stroke-width: 3;
  }
  .selected .outline {
    stroke: var(--stimulus);
    stroke-width: 2.5;
  }
  .edge {
    fill: none;
    stroke: var(--ink-muted);
    stroke-width: 1.25;
  }
  .edge.repeat {
    stroke: var(--flow-loop-stroke);
    stroke-dasharray: 5 3;
  }
  .arrowhead {
    fill: var(--ink-muted);
  }
  .edge-label {
    fill: var(--flow-loop-stroke);
    font-size: 11px;
    font-weight: 600;
  }
</style>
