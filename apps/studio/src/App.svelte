<script lang="ts">
  import AssetPanel from "./lib/AssetPanel.svelte";
  import ConditionsTable from "./lib/ConditionsTable.svelte";
  import DataPanel from "./lib/DataPanel.svelte";
  import SettingsPanel from "./lib/SettingsPanel.svelte";
  import AddStep from "./lib/AddStep.svelte";
  import PanelDivider from "./lib/PanelDivider.svelte";
  import { panels } from "./lib/panels.svelte.ts";
  import { backgroundColor, textColor } from "@jspsych-studio/compiler";
  import NodeForm from "./lib/NodeForm.svelte";
  import Preview from "./lib/Preview.svelte";
  import Tree from "./lib/Tree.svelte";
  import {
    addAtInsertion,
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
  import { pluginNames, startingParams } from "./lib/schemas.ts";
  import { examples } from "./lib/examples.ts";

  const tables = $derived(conditionTableNames());

  const firstTrial = () => newTrial(DEFAULT_PLUGIN, startingParams(DEFAULT_PLUGIN));

  let importError = $state("");

  const DEFAULT_PLUGIN = "html-keyboard-response";

  const TABS = [
    { id: "timeline", label: "Timeline" },
    { id: "conditions", label: "Conditions" },
    { id: "files", label: "Files" },
    { id: "study", label: "Study" },
  ] as const;

  let tab = $state<(typeof TABS)[number]["id"]>("timeline");

  // A warning that lives behind a tab is a warning nobody reads, so the tab says it is there.
  const unsavedData = $derived(!project.spec.data && project.spec.timeline.length > 0);
  const marked = (id: string) => id === "study" && unsavedData;

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
      tab = "timeline";
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
      if (!confirmDiscard()) return;
      startNewProject();
      // Starting over should land where an experiment begins, not wherever you happened to be.
      tab = "timeline";
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
    <div class="tabs" role="tablist">
      {#each TABS as option (option.id)}
        <button
          role="tab"
          id={`tab-${option.id}`}
          aria-selected={tab === option.id}
          aria-controls={`panel-${option.id}`}
          class:active={tab === option.id}
          data-testid={`tab-${option.id}`}
          onclick={() => (tab = option.id)}
        >
          {option.label}
          {#if marked(option.id)}<span class="mark" title="This experiment keeps no results">•</span
            >{/if}
        </button>
      {/each}
    </div>

    <div class="panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
      {#if tab === "timeline"}
        {#if project.spec.timeline.length === 0}
          <p class="muted">
            Nothing here yet. Open an example to see how one fits together, or use the + above to
            add your first step.
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
          <AddStep path={[]} index={0} />
        {:else}
          <Tree nodes={project.spec.timeline} />
        {/if}
      {:else if tab === "conditions"}
        <ConditionsTable />
      {:else if tab === "files"}
        <AssetPanel />
      {:else}
        <DataPanel />
        <SettingsPanel />
      {/if}
    </div>
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
    min-width: 0;
  }
  .tabs {
    display: flex;
    gap: 0.15rem;
    border-bottom: 1px solid var(--rule);
  }
  .tabs button {
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    padding: 0.3rem 0.45rem;
    cursor: pointer;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .tabs button.active {
    color: inherit;
    border-bottom-color: var(--accent);
  }
  .mark {
    color: var(--accent);
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-height: 0;
    overflow: auto;
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
