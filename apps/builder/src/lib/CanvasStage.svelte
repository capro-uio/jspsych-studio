<script lang="ts">
  import {
    extent,
    fromColumn,
    geometry,
    imageSize,
    imageSizeLoader,
    nudge,
    numberOr,
    pinned,
    placeAt,
    samePlacement,
    TEXT_LINE_SPACING,
    toStage,
    type CanvasObject,
    type Placement,
    type Point,
    type Stage,
  } from "./canvas.ts";
  import { project } from "./project.svelte.ts";

  interface Props {
    testId: string;
    stage: Stage;
    objects: unknown[];
    selected: number | null;
    onselect: (index: number | null) => void;
    onchange: (objects: unknown[]) => void;
  }

  const { testId, stage, objects, selected, onselect, onchange }: Props = $props();

  interface Drag {
    index: number;
    pointer: number;
    grab: Point;
    placement: Placement | null;
  }

  let svg: SVGSVGElement | undefined = $state();
  let drag = $state.raw<Drag | null>(null);
  let naturalSizes = $state<Record<string, { width: number; height: number }>>({});
  const requestImageSize = imageSizeLoader((url, size) => (naturalSizes[url] = size));

  const asObject = (entry: unknown): CanvasObject =>
    entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as CanvasObject) : {};

  const stored = $derived(objects.map(asObject));
  const shown = $derived(
    stored.map((object, index) =>
      drag?.index === index && drag.placement ? drag.placement.object : object,
    ),
  );
  const assetUrls = $derived(
    new Map((project.spec.assets ?? []).map((asset) => [asset.name, asset.url])),
  );

  const imageUrl = (object: CanvasObject) =>
    typeof object.file === "string" ? assetUrls.get(object.file) : undefined;

  $effect(() => {
    for (const object of stored) {
      const url = imageUrl(object);
      if (url) requestImageSize(url);
    }
  });

  const colour = (value: unknown, fallback: string) =>
    typeof value === "string" && value ? value : fallback;

  const coordinate = (value: unknown) =>
    fromColumn(value) ? `from ${value.var}` : String(numberOr(value, 0));

  function describe(object: CanvasObject, index: number) {
    const shape = typeof object.obj_type === "string" ? object.obj_type : "object";
    return `${shape} ${index + 1} at ${coordinate(object.startX)}, ${coordinate(object.startY)}`;
  }

  function stagePoint(event: PointerEvent): Point {
    const matrix = svg?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  function replace(index: number, object: CanvasObject) {
    onchange(objects.map((existing, position) => (position === index ? object : existing)));
  }

  function pickUp(event: PointerEvent, index: number) {
    if (event.button !== 0) return;
    event.stopPropagation();
    // Focusing on press would scroll the panel while the object is being dragged.
    event.preventDefault();
    if (pinned(stored[index])) {
      select(index);
      return;
    }
    const centre = toStage(stored[index], stage);
    const point = stagePoint(event);
    svg?.setPointerCapture(event.pointerId);
    drag = {
      index,
      pointer: event.pointerId,
      grab: { x: point.x - centre.x, y: point.y - centre.y },
      placement: null,
    };
  }

  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const point = stagePoint(event);
    const placement = placeAt(
      stored[drag.index],
      { x: point.x - drag.grab.x, y: point.y - drag.grab.y },
      stage,
      { snap: !event.altKey },
    );
    if (!samePlacement(drag.placement, placement)) drag = { ...drag, placement };
  }

  function drop(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { index, placement } = drag;
    drag = null;
    if (placement) replace(index, placement.object);
    select(index);
  }

  function select(index: number) {
    svg?.querySelector<SVGGElement>(`[data-index="${index}"]`)?.focus({ preventScroll: true });
    onselect(index);
  }

  const STEPS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };

  function keydown(event: KeyboardEvent, index: number) {
    const step = STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    const distance = event.shiftKey ? 10 : 1;
    replace(index, nudge(stored[index], step[0] * distance, step[1] * distance));
  }
</script>

<figure class="stage">
  <svg
    bind:this={svg}
    data-testid={testId}
    viewBox={`0 0 ${stage.width} ${stage.height}`}
    style:aspect-ratio={`${stage.width} / ${stage.height}`}
    style:width={`min(100%, calc(50vh * ${stage.width} / ${stage.height}))`}
    role="application"
    aria-label="Canvas: drag an object to place it, or select it and use the arrow keys"
    onpointerdown={() => onselect(null)}
    onpointermove={move}
    onpointerup={drop}
    onpointercancel={drop}
    onlostpointercapture={drop}
  >
    <rect class="backdrop" width={stage.width} height={stage.height} fill={stage.background} />
    <g class="centre-lines">
      <line
        class:snapped={drag?.placement?.snapped.vertical}
        x1={stage.width / 2}
        x2={stage.width / 2}
        y1="0"
        y2={stage.height}
      />
      <line
        class:snapped={drag?.placement?.snapped.horizontal}
        x1="0"
        x2={stage.width}
        y1={stage.height / 2}
        y2={stage.height / 2}
      />
    </g>

    {#each shown as object, index (index)}
      {@const centre = toStage(object, stage)}
      {@const url = imageUrl(object)}
      {@const natural = url ? naturalSizes[url] : undefined}
      {@const shape = geometry(object)}
      {@const size = extent(object, shape, natural)}
      <g
        class="object"
        class:selected={selected === index}
        class:dragging={drag?.index === index}
        class:pinned={pinned(object)}
        data-index={index}
        data-testid={`${testId}-object-${index}`}
        role="button"
        tabindex="0"
        aria-label={describe(object, index)}
        aria-pressed={selected === index}
        onpointerdown={(event) => pickUp(event, index)}
        onkeydown={(event) => keydown(event, index)}
        onfocus={() => selected !== index && onselect(index)}
      >
        {#if object.obj_type === "cross"}
          {@const half = shape.length / 2}
          <g stroke={colour(object.line_color, "#000000")} stroke-width={shape.lineWidth}>
            <line x1={centre.x - half} x2={centre.x + half} y1={centre.y} y2={centre.y} />
            <line x1={centre.x} x2={centre.x} y1={centre.y - half} y2={centre.y + half} />
          </g>
        {:else if object.obj_type === "circle"}
          <circle
            cx={centre.x}
            cy={centre.y}
            r={shape.radius}
            fill={colour(object.fill_color, "none")}
            stroke={colour(object.line_color, "none")}
            stroke-width={shape.lineWidth}
          />
        {:else if object.obj_type === "rect"}
          <rect
            x={centre.x - shape.width / 2}
            y={centre.y - shape.height / 2}
            width={shape.width}
            height={shape.height}
            fill={colour(object.fill_color, "none")}
            stroke={colour(object.line_color, "none")}
            stroke-width={shape.lineWidth}
          />
        {:else if object.obj_type === "line"}
          {@const dx = (shape.length / 2) * Math.cos(shape.theta)}
          {@const dy = (shape.length / 2) * Math.sin(shape.theta)}
          <line
            x1={centre.x - dx}
            y1={centre.y - dy}
            x2={centre.x + dx}
            y2={centre.y + dy}
            stroke={colour(object.line_color, "black")}
            stroke-width={shape.lineWidth}
          />
        {:else if object.obj_type === "text"}
          <text
            text-anchor="middle"
            dominant-baseline="middle"
            fill={colour(object.text_color, "#000000")}
            font-size={shape.fontSize}
            font-family={colour(object.fontFamily, "Arial")}
            font-weight={colour(object.fontWeight, "normal")}
            font-style={colour(object.fontStyle, "normal")}
          >
            {#each shape.lines as line, row (row)}
              <tspan
                x={centre.x}
                y={centre.y -
                  (TEXT_LINE_SPACING * (shape.lines.length - 1)) / 2 +
                  TEXT_LINE_SPACING * row}>{line}</tspan
              >
            {/each}
          </text>
        {:else if object.obj_type === "image" && url && natural}
          {@const drawn = imageSize(object, natural)}
          <image
            href={url}
            x={centre.x - drawn.width / 2}
            y={centre.y - drawn.height / 2}
            width={drawn.width}
            height={drawn.height}
            preserveAspectRatio="none"
          />
        {:else}
          <rect
            class="stand-in"
            x={centre.x - size.width / 2}
            y={centre.y - size.height / 2}
            width={size.width}
            height={size.height}
          />
        {/if}
        <rect
          class="outline"
          x={centre.x - size.width / 2}
          y={centre.y - size.height / 2}
          width={size.width}
          height={size.height}
        />
      </g>
    {/each}
  </svg>
  <figcaption>
    {#if stage.sized}
      The canvas is {stage.width} × {stage.height} pixels.
    {:else}
      The canvas fills the participant's window; it is drawn here at {stage.width} × {stage.height}.
    {/if}
    Drag to place, snapping to the centre lines (hold Alt to place freely); arrow keys nudge the selected
    object.
  </figcaption>
</figure>

<style>
  .stage {
    margin: 0 0 0.5rem;
  }
  svg {
    display: block;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    touch-action: none;
    user-select: none;
  }
  .centre-lines line {
    stroke: rgb(255 255 255 / 0.35);
    stroke-width: 1;
    stroke-dasharray: 4 4;
    vector-effect: non-scaling-stroke;
  }
  .centre-lines line.snapped {
    stroke: var(--signal);
    stroke-dasharray: none;
  }
  .object {
    cursor: grab;
    outline: none;
  }
  .object.dragging {
    cursor: grabbing;
  }
  .object.pinned {
    cursor: pointer;
  }
  .outline {
    fill: transparent;
    stroke: transparent;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .object:hover .outline {
    stroke: rgb(255 255 255 / 0.6);
    stroke-dasharray: 3 3;
  }
  .object.selected .outline,
  .object:focus-visible .outline {
    stroke: var(--signal);
    stroke-width: 2;
    stroke-dasharray: none;
  }
  .stand-in {
    fill: rgb(255 255 255 / 0.15);
    stroke: rgb(0 0 0 / 0.5);
    stroke-dasharray: 4 3;
    vector-effect: non-scaling-stroke;
  }
  figcaption {
    margin-top: 0.3rem;
    font-size: 0.78rem;
    color: var(--ink-muted);
  }
</style>
