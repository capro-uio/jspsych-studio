<script lang="ts">
  import type { BlockNode, LoopNode, ParameterValue, TrialNode } from "@jspsych-studio/compiler";
  import Field from "./Field.svelte";
  import {
    allConditionColumns,
    assetOptions,
    conditionTableNames,
    conditionColumns,
    project,
    selectedNode,
  } from "./project.svelte.ts";
  import { editableParameters, pluginNames } from "./schemas.ts";

  const node = $derived(selectedNode());
  const trial = $derived(node?.kind === "trial" ? (node as TrialNode) : null);
  const block = $derived(node?.kind === "block" ? (node as BlockNode) : null);
  const loop = $derived(node?.kind === "loop" ? (node as LoopNode) : null);
  const columns = $derived(allConditionColumns());
  const assets = $derived(assetOptions());

  let showAllParameters = $state(false);

  const parameters = $derived(trial ? editableParameters(trial.plugin) : []);
  const visibleParameters = $derived(
    showAllParameters
      ? parameters
      : parameters.filter(({ name, required }) => required || trial?.params?.[name] !== undefined),
  );

  function setParameter(name: string, value: ParameterValue | undefined) {
    if (!trial) return;
    trial.params ??= {};
    if (value === undefined) delete trial.params[name];
    else trial.params[name] = value;
  }

  function setScoreColumn(column: string) {
    if (!trial) return;
    if (column === "") delete trial.score;
    else trial.score = { correct_if_response_equals: { var: column } };
  }

  function toggleRecordedColumn(column: string, recorded: boolean) {
    if (!trial) return;
    trial.record ??= {};
    if (recorded) trial.record[column] = { var: column };
    else delete trial.record[column];
    if (Object.keys(trial.record).length === 0) delete trial.record;
  }
</script>

{#if !node}
  <p class="empty">Select a step in the timeline, or add one.</p>
{:else if trial}
  <h2>Trial</h2>
  <div class="field">
    <label for="trial-plugin"><span class="name">plugin</span></label>
    <select
      id="trial-plugin"
      data-testid="trial-plugin"
      value={trial.plugin}
      onchange={(event) => {
        trial.plugin = event.currentTarget.value;
        trial.params = {};
      }}
    >
      {#each pluginNames as plugin (plugin)}
        <option value={plugin}>{plugin}</option>
      {/each}
    </select>
  </div>

  <div class="field">
    <label for="trial-tag"><span class="name">tag</span></label>
    <input
      id="trial-tag"
      data-testid="trial-tag"
      placeholder="groups rows in the data, e.g. practice"
      value={trial.tag ?? ""}
      onchange={(event) => {
        const value = event.currentTarget.value;
        if (value) trial.tag = value;
        else delete trial.tag;
      }}
    />
  </div>

  {#each visibleParameters as { name, parameter, required } (name)}
    <Field
      {assets}
      {name}
      {parameter}
      {required}
      {columns}
      value={trial.params?.[name]}
      onchange={(value) => setParameter(name, value)}
    />
  {/each}

  <button
    class="toggle"
    data-testid="toggle-parameters"
    onclick={() => (showAllParameters = !showAllParameters)}
  >
    {showAllParameters ? "show only what is set" : `show all ${parameters.length} parameters`}
  </button>

  {#if columns.length > 0}
    <h3>Scoring and data</h3>
    <div class="field">
      <label for="score-column"><span class="name">correct when response equals</span></label>
      <select
        id="score-column"
        data-testid="score-column"
        value={typeof trial.score?.correct_if_response_equals === "object"
          ? trial.score.correct_if_response_equals.var
          : ""}
        onchange={(event) => setScoreColumn(event.currentTarget.value)}
      >
        <option value="">not scored</option>
        {#each columns as column (column)}
          <option value={column}>{column}</option>
        {/each}
      </select>
    </div>
    <div class="field">
      <span class="name">record columns in the data</span>
      <div class="checks">
        {#each columns as column (column)}
          <label class="check">
            <input
              type="checkbox"
              data-testid={`record-${column}`}
              checked={Boolean(trial.record?.[column])}
              onchange={(event) => toggleRecordedColumn(column, event.currentTarget.checked)}
            />
            {column}
          </label>
        {/each}
      </div>
    </div>
  {/if}
{:else if block}
  <h2>Block</h2>
  <div class="field">
    <label for="block-conditions"><span class="name">conditions table</span></label>
    <select
      id="block-conditions"
      data-testid="block-conditions"
      value={block.conditions}
      onchange={(event) => (block.conditions = event.currentTarget.value)}
    >
      {#each conditionTableNames() as table (table)}
        <option value={table}>{table} ({conditionColumns(table).length} columns)</option>
      {/each}
    </select>
  </div>
  <div class="field">
    <label for="block-repetitions"><span class="name">repetitions</span></label>
    <input
      id="block-repetitions"
      data-testid="block-repetitions"
      type="number"
      min="1"
      value={block.repetitions ?? 1}
      onchange={(event) => {
        const value = event.currentTarget.valueAsNumber;
        if (value > 1) block.repetitions = value;
        else delete block.repetitions;
      }}
    />
  </div>
  <div class="field">
    <label for="block-randomize"><span class="name">randomise order</span></label>
    <input
      id="block-randomize"
      data-testid="block-randomize"
      type="checkbox"
      checked={Boolean(block.randomize_order)}
      onchange={(event) => {
        if (event.currentTarget.checked) block.randomize_order = true;
        else delete block.randomize_order;
      }}
    />
  </div>
{:else if loop}
  <h2>Loop</h2>
  <p class="help">Repeats its contents while accuracy on the tagged trials stays below a cutoff.</p>
  <div class="field">
    <label for="loop-accuracy"><span class="name">repeat while accuracy below</span></label>
    <input
      id="loop-accuracy"
      data-testid="loop-accuracy"
      type="number"
      min="0"
      max="1"
      step="0.05"
      value={loop.repeat_while.accuracy_below}
      onchange={(event) => (loop.repeat_while.accuracy_below = event.currentTarget.valueAsNumber)}
    />
  </div>
  <div class="field">
    <label for="loop-scope"><span class="name">measured on tag</span></label>
    <input
      id="loop-scope"
      data-testid="loop-scope"
      value={loop.repeat_while.scope}
      onchange={(event) => (loop.repeat_while.scope = event.currentTarget.value)}
    />
  </div>
  <div class="field">
    <label for="loop-id"><span class="name">name</span></label>
    <input
      id="loop-id"
      data-testid="loop-id"
      value={loop.id ?? ""}
      onchange={(event) => {
        const value = event.currentTarget.value;
        if (value) loop.id = value;
        else delete loop.id;
      }}
    />
  </div>
{/if}

<style>
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  h3 {
    margin: 1rem 0 0;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .field {
    display: grid;
    grid-template-columns: 11rem 1fr;
    gap: 0.4rem 0.6rem;
    align-items: center;
    padding: 0.4rem 0;
    border-top: 1px solid var(--rule);
  }
  .name {
    font-weight: 600;
  }
  .checks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .check {
    display: flex;
    gap: 0.3rem;
    align-items: center;
  }
  .toggle {
    margin-top: 0.6rem;
    border: 0;
    padding: 0.2rem 0;
    color: var(--muted);
    text-decoration: underline;
  }
  .empty,
  .help {
    color: var(--muted);
  }
</style>
