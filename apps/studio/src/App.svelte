<script lang="ts">
  import AssetPanel from "./lib/AssetPanel.svelte";
  import ConditionsTable from "./lib/ConditionsTable.svelte";
  import AuthorsPanel from "./lib/AuthorsPanel.svelte";
  import DataPanel from "./lib/DataPanel.svelte";
  import SettingsPanel from "./lib/SettingsPanel.svelte";
  import AddStep from "./lib/AddStep.svelte";
  import PanelDivider from "./lib/PanelDivider.svelte";
  import { panels } from "./lib/panels.svelte.ts";
  import { setTheme, theme, type Theme } from "./lib/theme.svelte.ts";
  import { download, specFilename } from "./lib/files.ts";
  import HeaderMenu from "./lib/HeaderMenu.svelte";
  import { buildExperimentHtml, buildProjectZip } from "./lib/experiment.svelte.ts";
  import { backgroundColor, textColor } from "@jspsych-studio/compiler";
  import NodeForm from "./lib/NodeForm.svelte";
  import Preview from "./lib/Preview.svelte";
  import Tree from "./lib/Tree.svelte";
  import {
    addAtInsertion,
    canHoldChildren,
    conditionTableNames,
    exportedSpec,
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
  let downloadError = $state("");

  async function downloadExperiment() {
    try {
      const html = await buildExperimentHtml();
      download(`${specFilename(project.spec)}.html`, html, "text/html");
      downloadError = "";
    } catch (error) {
      downloadError = `Not ready to download: ${(error as Error).message.split("\n")[0]}`;
    }
  }

  function downloadProject() {
    download(
      `${specFilename(project.spec)}.json`,
      JSON.stringify(exportedSpec(), null, 2),
      "application/json",
    );
  }

  async function downloadEverything() {
    try {
      const zip = await buildProjectZip();
      download(`${specFilename(project.spec)}.zip`, zip, "application/zip");
      downloadError = "";
    } catch (error) {
      downloadError = `Not ready to download: ${(error as Error).message.split("\n")[0]}`;
    }
  }

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
  function startOver() {
    if (!confirmDiscard()) return;
    startNewProject();
    // Starting over should land where an experiment begins, not wherever you happened to be.
    tab = "timeline";
  }

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
  {#if importError || downloadError}
    <p class="notice" data-testid="import-error">{importError || downloadError}</p>
  {/if}

  <button class="primary" data-testid="download-zip" onclick={downloadEverything}>
    Download experiment
  </button>

  <HeaderMenu label="More actions">
    <button class="item" data-testid="new-project" onclick={startOver}>New experiment</button>
    <label class="item">
      Open a project…
      <input
        type="file"
        accept="application/json"
        data-testid="import-spec"
        onchange={importSpec}
      />
    </label>
    <button class="item" data-testid="download-html" onclick={downloadExperiment}>
      Download as one HTML file
    </button>
    <button class="item" data-testid="download-spec" onclick={downloadProject}>
      Download project file only
    </button>
    <div class="group">
      <span>Appearance</span>
      <div class="segmented">
        {#each ["system", "light", "dark"] as const as option (option)}
          <button
            class:active={theme.choice === option}
            data-testid={`theme-${option}`}
            onclick={() => setTheme(option)}>{option}</button
          >
        {/each}
      </div>
    </div>
  </HeaderMenu>
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
        <AuthorsPanel />
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
  .notice {
    margin: 0;
    color: var(--accent);
    font-size: 0.85rem;
  }
  .primary {
    border: 1px solid var(--rule);
    border-radius: 5px;
    background: none;
    cursor: pointer;
    padding: 0.3rem 0.6rem;
    font-size: 0.85rem;
  }
  .primary:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .item {
    display: block;
    width: 100%;
    text-align: left;
    border: 0;
    background: none;
    cursor: pointer;
    padding: 0.35rem 0.45rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }
  .item:hover {
    background: var(--selected);
  }
  .item input {
    display: none;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.4rem 0.45rem 0.2rem;
    border-top: 1px solid var(--rule);
    margin-top: 0.2rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .segmented {
    display: flex;
  }
  .segmented button {
    flex: 1;
    border: 1px solid var(--rule);
    background: none;
    cursor: pointer;
    padding: 0.15rem 0.3rem;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .segmented button + button {
    border-left: 0;
  }
  .segmented button:first-child {
    border-radius: 4px 0 0 4px;
  }
  .segmented button:last-child {
    border-radius: 0 4px 4px 0;
  }
  .segmented button.active {
    border-color: var(--accent);
    color: var(--accent);
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
    flex-wrap: wrap;
    gap: 0.15rem;
    border-bottom: 1px solid var(--rule);
  }
  .tabs button {
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    padding: 0.3rem 0.35rem;
    cursor: pointer;
    color: var(--muted);
    font-size: 0.85rem;
    /* A tab that cannot show its own name is worse than one that wraps to the next line. */
    white-space: nowrap;
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
