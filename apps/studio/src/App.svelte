<script lang="ts">
  import AssetPanel from "./lib/AssetPanel.svelte";
  import ConditionsTable from "./lib/ConditionsTable.svelte";
  import DataPanel from "./lib/DataPanel.svelte";
  import NodeForm from "./lib/NodeForm.svelte";
  import Preview from "./lib/Preview.svelte";
  import Tree from "./lib/Tree.svelte";
  import {
    addNode,
    canHoldChildren,
    conditionTableNames,
    loadSpec,
    parseSpec,
    newBlock,
    newLoop,
    newAssign,
    newBranch,
    newCheckpoint,
    newTrial,
    project,
  } from "./lib/project.svelte.ts";
  import { pluginNames } from "./lib/schemas.ts";

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
  {#if importError}
    <p class="import-error" data-testid="import-error">{importError}</p>
  {/if}
  <label class="import">
    import spec
    <input type="file" accept="application/json" data-testid="import-spec" onchange={importSpec} />
  </label>
</header>

<main>
  <aside>
    <h2>Timeline</h2>
    {#if project.spec.timeline.length === 0}
      <p class="muted">Empty. Add a trial to begin.</p>
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
  </aside>

  <section class="form"><NodeForm /></section>
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
  .import {
    cursor: pointer;
    color: var(--muted);
    font-size: 0.85rem;
  }
  main {
    display: grid;
    grid-template-columns: 18rem minmax(22rem, 1fr) minmax(24rem, 1.2fr);
    gap: 1rem;
    padding: 1rem;
    min-height: 0;
    flex: 1;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    overflow: auto;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
  }
  .palette {
    display: flex;
    gap: 0.4rem;
  }
  .form,
  .preview {
    min-height: 0;
    overflow: auto;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0;
  }
  @media (max-width: 60rem) {
    main {
      grid-template-columns: 1fr;
    }
  }
</style>
