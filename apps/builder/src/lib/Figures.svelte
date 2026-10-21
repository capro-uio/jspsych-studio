<script lang="ts">
  import { download, specFilename } from "./files.ts";
  import {
    blockChoice,
    blockKey,
    figureChoices,
    rememberFigureChoices,
    setBlockChoice,
  } from "./figure-choices.svelte.ts";
  import { figureName, makeFigure, type MadeFigure } from "./figure-making.ts";
  import { studyFlowFigure } from "./flow-figure.ts";
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
  const specJson = $derived(JSON.stringify(spec));
  const sequences = $derived(
    containerPaths(spec.timeline)
      .map((path) => sequenceAt(spec, path, pluginSchema))
      .filter(
        (sequence): sequence is Sequence => sequence !== null && sequence.segments.length > 0,
      ),
  );
  const flowSvg = $derived(studyFlowFigure(spec));

  // What a figure was made from; a picture taken from anything else is out of date.
  const stampOf = (sequence: Sequence) =>
    JSON.stringify([
      specJson,
      figureChoices.arrangement,
      figureChoices.size,
      blockChoice(sequence.path),
    ]);

  let pictured = $state<Record<string, { stamp: string; made: MadeFigure }>>({});
  let busy = $state<Record<string, string>>({});
  let errors = $state<Record<string, string>>({});
  const stop = new AbortController();
  $effect(() => () => stop.abort());

  function current(sequence: Sequence) {
    const kept = pictured[blockKey(sequence.path)];
    return kept && kept.stamp === stampOf(sequence) ? kept.made : null;
  }

  // Until its screens are pictured, a figure is drawn at once with plain ones.
  function plain(sequence: Sequence) {
    return sequenceFigure(spec, sequence, figureChoices).svg;
  }

  const imageOf = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  async function picture(sequence: Sequence) {
    const key = blockKey(sequence.path);
    const stamp = stampOf(sequence);
    busy[key] = "Picturing the screens…";
    errors[key] = "";
    try {
      const { captureScreens } = await import("./screen-capture.ts");
      const made = await makeFigure(spec, sequence, figureChoices, blockChoice(sequence.path), {
        capture: captureScreens,
        signal: stop.signal,
        onProgress: (message) => (busy[key] = message),
      });
      if (!stop.signal.aborted) pictured[key] = { stamp, made };
      return made;
    } catch (error) {
      errors[key] = `The figure could not be made: ${(error as Error).message}`;
      return null;
    } finally {
      delete busy[key];
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

  async function downloadFigure(sequence: Sequence) {
    const made = current(sequence) ?? (await picture(sequence));
    if (!made || stop.signal.aborted) return;
    const name = `${specFilename(spec)}-${figureName(spec, sequence)}`;
    await save(name, made.svg, made.pixelWidth).catch((error: Error) => {
      errors[blockKey(sequence.path)] = `The figure could not be made: ${error.message}`;
    });
  }

  function downloadFlow() {
    const width = Number(/viewBox="0 0 (\d+(?:\.\d+)?)/.exec(flowSvg)?.[1] ?? 600);
    void save(`${specFilename(spec)}-flow`, flowSvg, width * 2);
  }

  const kindLabel = (sequence: Sequence) => (sequence.kind === "block" ? "Block" : "Loop");
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
      <button type="button" onclick={downloadFlow} data-testid="figure-flow-download"
        >Download</button
      >
    </header>
    <img src={imageOf(flowSvg)} alt="The study's flow, as a figure" />
  </article>

  {#each sequences as sequence (blockKey(sequence.path))}
    {@const key = blockKey(sequence.path)}
    {@const choice = blockChoice(sequence.path)}
    {@const columns = conditionColumns(spec, sequence.path)}
    {@const rows = rowLabels(spec, sequence.path)}
    {@const made = current(sequence)}
    <article class="card" data-testid={`figure-${sequence.path.join("-")}`}>
      <header>
        <h3>{kindLabel(sequence)} · {containerName(spec, sequence.path)}</h3>
        <div class="actions">
          <button
            type="button"
            onclick={() => picture(sequence)}
            disabled={key in busy || made !== null}
            data-testid="figure-picture">Show the screens</button
          >
          <button
            type="button"
            onclick={() => downloadFigure(sequence)}
            disabled={key in busy}
            aria-busy={key in busy}
            data-testid="figure-download">{busy[key] ?? "Download"}</button
          >
        </div>
      </header>
      {#if columns.length > 0 || rows.length > 1}
        <div class="choices">
          {#if columns.length > 0}
            <label>
              Show conditions by
              <select
                value={choice.byColumn}
                onchange={(event) =>
                  setBlockChoice(sequence.path, { byColumn: event.currentTarget.value })}
                title="Each condition is pictured from the first row that has its value"
                data-testid="figure-conditions"
              >
                <option value="">None</option>
                {#each columns as { column, values } (column)}
                  <option value={column}
                    >{column} ({values.map((each) => each.value).join(", ")})</option
                  >
                {/each}
              </select>
            </label>
          {/if}
          {#if rows.length > 1 && !choice.byColumn}
            <label>
              Conditions row
              <select
                value={choice.row < rows.length ? choice.row : 0}
                onchange={(event) =>
                  setBlockChoice(sequence.path, { row: Number(event.currentTarget.value) })}
                data-testid="figure-row"
              >
                {#each rows as label, index (index)}
                  <option value={index}>{label}</option>
                {/each}
              </select>
            </label>
          {/if}
        </div>
      {/if}
      <img
        src={imageOf(made?.svg ?? plain(sequence))}
        alt={`${kindLabel(sequence)} ${containerName(spec, sequence.path)}, screen by screen`}
        data-testid="figure-preview"
        data-pictured={made !== null}
      />
      {#if made?.note}
        <p class="note" role="status">{made.note}</p>
      {:else if !made && choice.byColumn}
        <p class="note">Show the screens to see each condition side by side.</p>
      {/if}
      {#if errors[key]}
        <p class="error" role="alert">{errors[key]}</p>
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
