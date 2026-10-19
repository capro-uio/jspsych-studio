<script lang="ts">
  import {
    DECISION_INSET,
    LINE_HEIGHT,
    PAD_X,
    PAD_Y,
    layoutFlow,
    type FlowBox,
    type FlowEdge,
  } from "./flow.ts";
  import { project } from "./project.svelte.ts";
  import { ui } from "./ui.svelte.ts";

  const layout = $derived(layoutFlow(project.spec));
  const selectionKey = $derived(project.selection?.join(".") ?? null);

  const BASELINE = 12;

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

  const centred = (box: FlowBox) => box.shape !== "frame";

  function textX(box: FlowBox) {
    return centred(box) ? box.x + box.width / 2 : box.x + PAD_X;
  }

  function lineY(box: FlowBox, line: number) {
    return box.y + PAD_Y + BASELINE + line * LINE_HEIGHT;
  }

  function decisionOutline(box: FlowBox) {
    const { x, y, width, height } = box;
    const middle = y + height / 2;
    return (
      `M ${x + DECISION_INSET} ${y} H ${x + width - DECISION_INSET} L ${x + width} ${middle} ` +
      `L ${x + width - DECISION_INSET} ${y + height} H ${x + DECISION_INSET} L ${x} ${middle} Z`
    );
  }

  const edgePath = (edge: FlowEdge) =>
    edge.points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  const radius = (box: FlowBox) =>
    box.shape === "terminal" || box.shape === "lane" ? box.height / 2 : 6;
</script>

<div class="flow" data-testid="flow">
  <p class="hint" id="flow-hint">How the study runs, top to bottom. Select a step to edit it.</p>
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
          rx={radius(box)}
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
  .hint {
    margin: 0 0 0.3rem;
    font-size: 0.78rem;
    color: var(--ink-muted);
  }
  svg {
    display: block;
    margin: 0 auto;
    font-size: 12px;
  }
  .outline {
    fill: var(--flow-step-fill);
    stroke: var(--flow-step-stroke);
    stroke-width: 1.25;
  }
  .shape-frame .outline {
    fill: var(--flow-frame-fill);
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
