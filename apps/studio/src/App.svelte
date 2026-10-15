<script lang="ts">
  import AssetPanel from "./lib/AssetPanel.svelte";
  import ConditionsTable from "./lib/ConditionsTable.svelte";
  import DataPanel from "./lib/DataPanel.svelte";
  import SettingsPanel from "./lib/SettingsPanel.svelte";
  import PanelDivider from "./lib/PanelDivider.svelte";
  import { panels } from "./lib/panels.svelte.ts";
  import { backgroundColor, textColor } from "@jspsych-studio/compiler";
  import NodeForm from "./lib/NodeForm.svelte";
  import Preview from "./lib/Preview.svelte";
  import Tree from "./lib/Tree.svelte";
  import {
    addNode,
    canHoldChildren,
    conditionTableNames,
    loadSpec,
    parseSpec,
    startNewProject,
    newBlock,
    newLoop,
    newAssign,
    newBranch,
    newCheckpoint,
    newTrial,
    project,
  } from "./lib/project.svelte.ts";
  import { pluginNames } from "./lib/schemas.ts";
  import { examples } from "./lib/examples.ts";

  // Adding goes inside the selected step when it can hold steps, and beside it otherwise, so a
  // step selected inside a group adds to that group rather than jumping back to the top level.
  const insertionPath = $derived(
    project.selection
      ? canHoldChildren(project.selection)
        ? project.selection
        : project.selection.slice(0, -1)
      : [],
  );
  const tables = $derived(conditionTableNames());

  let importError = $state("");

  // Starting over throws away whatever is open, so only ask when there is something to lose.
  function confirmDiscard() {
    const empty = project.spec.timeline.length === 0;
    return empty || window.confirm("Start a new experiment? The one open here will be discarded.");
  }

  async function importSpec(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      loadSpec(parseSpec(await file.text()));
      importError = "";
    } catch (error) {
      importError = `Could not import ${file.name}: ${(error as Error).message}`;
    }
  }
</script>

<header>
  <h1>jsPsych Studio</h1>
  <input
    aria-label="experiment name"
    data-testid="experiment-name"
    bind:value={project.spec.name}
  />
  <span class="spacer"></span>
  <button
    class="plain"
    data-testid="new-project"
    onclick={() => {
      if (confirmDiscard()) startNewProject();
    }}>new</button
  >
  {#if importError}
    <p class="import-error" data-testid="import-error">{importError}</p>
  {/if}
  <label class="import">
    import spec
    <input type="file" accept="application/json" data-testid="import-spec" onchange={importSpec} />
  </label>
</header>

<main
  style={`--panel-widths: ${panels.widths.map((width) => `${width}fr`).join(" auto ")};` +
    `--stimulus-background: ${backgroundColor(project.spec.settings)};` +
    `--stimulus-text: ${textColor(project.spec.settings)}`}
>
  <aside>
    <h2>Timeline</h2>
    {#if project.spec.timeline.length === 0}
      <p class="muted">
        Nothing here yet. Add a step below, or open an example to see how one fits together.
      </p>
      <div class="examples">
        {#each examples as example (example.id)}
          <button
            class="example"
            data-testid={`example-${example.id}`}
            onclick={() => loadSpec(structuredClone(example.spec))}
          >
            <strong>{example.title}</strong>
            <span class="muted">{example.description}</span>
          </button>
        {/each}
      </div>
    {:else}
      <Tree nodes={project.spec.timeline} />
    {/if}

    <p class="muted">
      Adding into: {insertionPath.length === 0 ? "top level" : insertionPath.join(" › ")}
    </p>
    <div class="palette">
      <button
        data-testid="add-trial"
        onclick={() => addNode(insertionPath, newTrial(pluginNames[0]))}
      >
        + trial
      </button>
      <button
        data-testid="add-block"
        disabled={tables.length === 0}
        title={tables.length === 0 ? "add a conditions table first" : ""}
        onclick={() => addNode(insertionPath, newBlock(tables[0]))}
      >
        + block
      </button>
      <button data-testid="add-loop" onclick={() => addNode(insertionPath, newLoop())}>
        + loop
      </button>
      <button data-testid="add-assign" onclick={() => addNode(insertionPath, newAssign())}>
        + split
      </button>
      <button data-testid="add-branch" onclick={() => addNode(insertionPath, newBranch())}>
        + branch
      </button>
      <button data-testid="add-checkpoint" onclick={() => addNode(insertionPath, newCheckpoint())}>
        + checkpoint
      </button>
    </div>

    <ConditionsTable />
    <AssetPanel />
    <DataPanel />
    <SettingsPanel />
  </aside>

  <PanelDivider index={0} label="Resize the timeline panel" />
  <section class="form"><NodeForm /></section>
  <PanelDivider index={1} label="Resize the settings panel" />
  <section class="preview"><Preview /></section>
</main>

<style>
  header {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--rule);
  }
  h1 {
    margin: 0;
    font-size: 1rem;
    letter-spacing: 0.02em;
  }
  .spacer {
    flex: 1;
  }
  .import input {
    display: none;
  }
  .import-error {
    margin: 0;
    color: var(--accent);
    font-size: 0.85rem;
  }
  .import,
  .plain {
    cursor: pointer;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .plain {
    border: 0;
    background: none;
  }
  main {
    display: grid;
    grid-template-columns: 1fr;
    /* Stacked, there is nothing to drag a boundary between. */
    :global(.divider) {
      display: none;
    }
    gap: 1rem;
    padding: 1rem;
    flex: 1;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
  }
  .palette {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .examples {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .example {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    text-align: left;
    padding: 0.5rem;
    border: 1px dashed var(--rule);
  }
  .example .muted {
    font-size: 0.78rem;
  }
  .preview {
    /* Stacked, the preview has no column height to fill, so give it one worth looking at. */
    min-height: 26rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0;
  }
  /* Wide enough for columns side by side: the shell stops scrolling and each column scrolls
     itself, so the timeline stays put while a long form moves. Grid children need min-height: 0
     or their content forces the row taller than the viewport and the overflow is unreachable. */
  @media (min-width: 60rem) and (min-height: 34rem) {
    main :global(.divider) {
      display: block;
    }
    main {
      /* Three panels with a draggable boundary between each pair. */
      grid-template-columns: var(--panel-widths, 18fr 32fr 50fr);
      grid-auto-flow: column;
      min-height: 0;
      overflow: hidden;
    }
    aside,
    .form,
    .preview {
      min-height: 0;
      overflow: auto;
    }
    .preview {
      min-height: 0;
    }
  }
</style>
