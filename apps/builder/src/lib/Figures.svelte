<script lang="ts">
  import { download, specFilename } from "./files.ts";
  import {
    blockChoice,
    blockKey,
    figureChoices,
    rememberFigureChoices,
    setBlockChoice,
  } from "./figure-choices.svelte.ts";
  import {
    figureName,
    figureStamp,
    makeFigure,
    resolveBlockChoice,
    type MadeFigure,
  } from "./figure-making.ts";
  import { flowFigure } from "./flow-figure.ts";
  import { exportedSpec } from "./project.svelte.ts";
  import { pluginSchema } from "./schemas.ts";
  import {
    conditionColumns,
    containerName,
    containerPaths,
    rowLabels,
    sequenceAt,
    type Sequence,
  } from "./sequence.ts";
  import { sequenceFigure } from "./trial-figure.ts";

  const spec = $derived($state.snapshot(exportedSpec()));
  const shared = $derived({ arrangement: figureChoices.arrangement, size: figureChoices.size });
  const flow = $derived(flowFigure(spec, figureChoices.size));

  // Each block's card, worked out once for each change rather than on every look at it.
  const cards = $derived(
    containerPaths(spec.timeline)
      .map((path) => sequenceAt(spec, path, pluginSchema))
      .filter((sequence): sequence is Sequence => sequence !== null && sequence.segments.length > 0)
      .map((sequence) => {
        const choice = resolveBlockChoice(spec, sequence, blockChoice(spec, sequence.path));
        const name = containerName(spec, sequence.path);
        return {
          sequence,
          key: blockKey(spec, sequence.path),
          title: `${sequence.kind === "block" ? "Block" : "Loop"} · ${name}`,
          choice,
          columns: conditionColumns(spec, sequence.path),
          rows: rowLabels(spec, sequence.path),
          stamp: figureStamp(spec, sequence, shared, choice),
          // Until its screens are pictured, a figure is drawn at once with plain ones.
          plain: sequenceFigure(spec, sequence, shared).svg,
        };
      }),
  );
  type Card = (typeof cards)[number];

  let pictured = $state<Record<string, { stamp: string; made: MadeFigure }>>({});
  let busy = $state<Record<string, string>>({});
  let errors = $state<Record<string, string>>({});
  let urls = $state<Record<string, string>>({});
  const stop = new AbortController();
  $effect(() => () => stop.abort());

  const madeFor = (card: Card) =>
    pictured[card.key]?.stamp === card.stamp ? pictured[card.key].made : null;

  // Previews are shown from object URLs rather than data URLs, which for a figure with its
  // screens in it would run to megabytes; each is let go once it is replaced.
  $effect(() => {
    const made: Record<string, string> = { flow: flow.svg };
    for (const card of cards) made[card.key] = madeFor(card)?.svg ?? card.plain;
    const next = Object.fromEntries(
      Object.entries(made).map(([key, svg]) => [
        key,
        URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })),
      ]),
    );
    urls = next;
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  });

  // Pictures of blocks that are gone are let go of too.
  $effect(() => {
    const keys = new Set(cards.map((card) => card.key));
    for (const key of Object.keys(pictured)) if (!keys.has(key)) delete pictured[key];
  });

  async function picture(card: Card) {
    // Everything the figure is made from is fixed now, so an edit made while it is pictured
    // cannot leave it marked as made from something it was not.
    const fixedSpec = spec;
    const fixedChoices = { ...shared };
    const stamp = card.stamp;
    busy[card.key] = "Picturing the screens…";
    errors[card.key] = "";
    try {
      const { captureScreens } = await import("./screen-capture.ts");
      const made = await makeFigure(fixedSpec, card.sequence, fixedChoices, card.choice, {
        capture: captureScreens,
        signal: stop.signal,
        onProgress: (message) => (busy[card.key] = message),
      });
      if (!stop.signal.aborted) pictured[card.key] = { stamp, made };
      return made;
    } catch (error) {
      errors[card.key] = `The figure could not be made: ${(error as Error).message}`;
      return null;
    } finally {
      delete busy[card.key];
    }
  }

  async function save(name: string, svg: string, pixelWidth: number) {
    if (figureChoices.format === "svg") {
      download(`${name}.svg`, svg, "image/svg+xml");
      return;
    }
    const { figurePng } = await import("./figure-png.ts");
    download(`${name}.png`, await figurePng(svg, pixelWidth), "image/png");
  }

  async function downloadFigure(card: Card) {
    const made = madeFor(card) ?? (await picture(card));
    if (!made || stop.signal.aborted) return;
    const name = `${specFilename(spec)}-${figureName(spec, card.sequence)}`;
    await save(name, made.svg, made.pixelWidth).catch((error: Error) => {
      errors[card.key] = `The figure could not be made: ${error.message}`;
    });
  }

  async function downloadFlow() {
    errors.flow = "";
    await save(`${specFilename(spec)}-flow`, flow.svg, flow.pixelWidth).catch((error: Error) => {
      errors.flow = `The figure could not be made: ${error.message}`;
    });
  }
</script>

<div class="figures" data-testid="figures">
  <p class="hint">
    Figures of the study for a paper or poster. The project download carries them too, made as
    chosen here.
  </p>

  <div class="choices" role="group" aria-label="How every figure is made">
    <label>
      Layout
      <select
        bind:value={figureChoices.arrangement}
        onchange={rememberFigureChoices}
        data-testid="figures-layout"
      >
        <option value="stack">Screens stacked</option>
        <option value="row">Screens in a row</option>
      </select>
    </label>
    <label>
      Size
      <select
        bind:value={figureChoices.size}
        onchange={rememberFigureChoices}
        data-testid="figures-size"
      >
        <option value="screen">As drawn here</option>
        <option value="single">One column, 89 mm</option>
        <option value="double">Two columns, 183 mm</option>
      </select>
    </label>
    <label>
      Format
      <select
        bind:value={figureChoices.format}
        onchange={rememberFigureChoices}
        data-testid="figures-format"
      >
        <option value="svg">SVG, to edit</option>
        <option value="png">PNG{figureChoices.size === "screen" ? "" : ", 300 dpi"}</option>
      </select>
    </label>
  </div>

  <article class="card" data-testid="figure-flow">
    <header>
      <h3>Study flow</h3>
      <button
        type="button"
        onclick={downloadFlow}
        aria-label="Download the study flow"
        data-testid="figure-flow-download">Download</button
      >
    </header>
    <img src={urls.flow} alt="The study's flow, as a figure" />
    {#if errors.flow}
      <p class="error" role="alert">{errors.flow}</p>
    {/if}
  </article>

  {#each cards as card (card.key)}
    {@const made = madeFor(card)}
    <article class="card" data-testid={`figure-${card.sequence.path.join("-")}`}>
      <header>
        <h3>{card.title}</h3>
        <div class="actions">
          <button
            type="button"
            onclick={() => picture(card)}
            disabled={card.key in busy || made !== null}
            title={made ? "The preview already shows the screens" : undefined}
            aria-label={`Show the screens of ${card.title}`}
            data-testid="figure-picture">Show the screens</button
          >
          <button
            type="button"
            onclick={() => downloadFigure(card)}
            disabled={card.key in busy}
            aria-busy={card.key in busy}
            aria-label={`Download ${card.title}`}
            data-testid="figure-download">{busy[card.key] ?? "Download"}</button
          >
        </div>
      </header>
      {#if card.columns.length > 0 || card.rows.length > 1}
        <div class="choices">
          {#if card.columns.length > 0}
            <label>
              Show conditions by
              <select
                value={card.choice.byColumn}
                onchange={(event) =>
                  setBlockChoice(spec, card.sequence.path, {
                    byColumn: event.currentTarget.value,
                  })}
                title="Each condition is pictured from the first row that has its value"
                data-testid="figure-conditions"
              >
                <option value="">None</option>
                {#each card.columns as { column, values } (column)}
                  <option value={column}
                    >{column} ({values.map((each) => each.value).join(", ")})</option
                  >
                {/each}
              </select>
            </label>
          {/if}
          {#if card.rows.length > 1 && !card.choice.byColumn}
            <label>
              Conditions row
              <select
                value={card.choice.row}
                onchange={(event) =>
                  setBlockChoice(spec, card.sequence.path, {
                    row: Number(event.currentTarget.value),
                  })}
                data-testid="figure-row"
              >
                {#each card.rows as label, index (index)}
                  <option value={index}>{label}</option>
                {/each}
              </select>
            </label>
          {/if}
        </div>
      {/if}
      <img
        src={urls[card.key]}
        alt={`${card.title}, screen by screen`}
        data-testid="figure-preview"
        data-pictured={made !== null}
      />
      {#if made?.note}
        <p class="note" role="status">{made.note}</p>
      {:else if !made && card.choice.byColumn}
        <p class="note">Show the screens to see each condition side by side.</p>
      {/if}
      {#if errors[card.key]}
        <p class="error" role="alert">{errors[card.key]}</p>
      {/if}
    </article>
  {:else}
    <p class="hint">Add a block or loop to draw its trial as a figure.</p>
  {/each}
</div>

<style>
  .figures {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-2) 0;
  }
  .hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink-muted);
  }
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
    font-size: 0.85rem;
  }
  .choices label {
    display: grid;
    gap: 2px;
    color: var(--ink-muted);
  }
  .choices select {
    color: var(--ink);
  }
  .card {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--paper-raised);
  }
  .card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .card h3 {
    margin: 0;
    font-size: 0.95rem;
  }
  .actions {
    display: flex;
    gap: var(--space-1);
  }
  /* Figures are made for a white page, so they are shown on one whatever the theme. */
  .card img {
    display: block;
    max-width: 100%;
    height: auto;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
  }
  .note,
  .error {
    margin: 0;
    font-size: 0.85rem;
  }
  .note {
    color: var(--ink-muted);
  }
  .error {
    color: var(--danger);
  }
</style>
