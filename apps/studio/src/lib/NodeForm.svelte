<script lang="ts">
  import type {
    AssignNode,
    BranchNode,
    BlockNode,
    CheckpointNode,
    LoopNode,
    ParameterValue,
    TrialNode,
  } from "@jspsych-studio/compiler";
  import Field from "./Field.svelte";
  import {
    allConditionColumns,
    assetOptions,
    conditionTableNames,
    conditionColumns,
    project,
    selectedNode,
  } from "./project.svelte.ts";
  import { editableParameters, pluginNames, startingParams } from "./schemas.ts";
  import { currentProblems, problemsAt } from "./problems.svelte.ts";

  const node = $derived(selectedNode());
  const stepProblems = $derived(
    project.selection ? problemsAt(currentProblems(), project.selection) : [],
  );
  const trial = $derived(node?.kind === "trial" ? (node as TrialNode) : null);
  const block = $derived(node?.kind === "block" ? (node as BlockNode) : null);
  const loop = $derived(node?.kind === "loop" ? (node as LoopNode) : null);
  const assign = $derived(node?.kind === "assign" ? (node as AssignNode) : null);
  const checkpoint = $derived(node?.kind === "checkpoint" ? (node as CheckpointNode) : null);
  const branch = $derived(node?.kind === "branch" ? (node as BranchNode) : null);

  const branchComparison = $derived(
    branch?.when.accuracy_at_least === undefined ? "below" : "at_least",
  );

  function setBranchComparison(comparison: string) {
    if (!branch) return;
    const threshold = branch.when.accuracy_at_least ?? branch.when.accuracy_below ?? 0.8;
    if (comparison === "at_least") {
      delete branch.when.accuracy_below;
      branch.when.accuracy_at_least = threshold;
    } else {
      delete branch.when.accuracy_at_least;
      branch.when.accuracy_below = threshold;
    }
  }

  function setBranchThreshold(value: number) {
    if (!branch) return;
    if (branchComparison === "at_least") branch.when.accuracy_at_least = value;
    else branch.when.accuracy_below = value;
  }
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

{#if stepProblems.length > 0}
  <ul class="problems" data-testid="step-problems">
    {#each stepProblems as problem (problem.message)}
      <li>{problem.message}</li>
    {/each}
  </ul>
{/if}

{#if !node}
  <p class="empty">Select a step in the timeline, or add one.</p>
  {#if project.selection}
    <p class="help">Steps you add now go into the selected group.</p>
  {/if}
{:else if trial}
  <h2>Trial</h2>
  <div class="field">
    <label for="trial-plugin"><span class="name">plugin</span></label>
    <select
      id="trial-plugin"
      data-testid="trial-plugin"
      value={trial.plugin}
      onchange={(event) => {
        const chosen = event.currentTarget.value;
        if (chosen === trial.plugin) return;
        // Settings do not carry across step types, but the new type should still arrive ready to
        // run where it can.
        trial.plugin = chosen;
        trial.params = startingParams(chosen) as typeof trial.params;
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
  <p class="help">
    The steps inside run once for every row of the table. To make a step differ between rows, set
    one of its settings to <em>from column</em>.
  </p>
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
{:else if assign}
  <h2>Split participants</h2>
  <p class="help">
    Each participant runs one group. Everything else in the timeline runs for everybody.
  </p>
  <div class="field">
    <label for="assign-method"><span class="name">how to choose</span></label>
    <select
      id="assign-method"
      data-testid="assign-method"
      value={assign.method}
      onchange={(event) => (assign.method = event.currentTarget.value as AssignNode["method"])}
    >
      <option value="random">at random, in the browser</option>
      <option value="balanced">balanced, counted by the data service</option>
    </select>
  </div>
  <div class="field">
    <label for="assign-column"><span class="name">record group as</span></label>
    <input
      id="assign-column"
      data-testid="assign-column"
      placeholder="group"
      value={assign.record_as ?? ""}
      onchange={(event) => {
        const value = event.currentTarget.value;
        if (value) assign.record_as = value;
        else delete assign.record_as;
      }}
    />
  </div>
  {#each assign.groups as group, index (index)}
    <div class="field">
      <label for={`group-${index}`}><span class="name">group {index + 1}</span></label>
      <span class="group-row">
        <input
          id={`group-${index}`}
          data-testid={`group-name-${index}`}
          value={group.name}
          onchange={(event) => (group.name = event.currentTarget.value)}
        />
        <button
          data-testid={`remove-group-${index}`}
          disabled={assign.groups.length <= 2}
          onclick={() => assign.groups.splice(index, 1)}>✕</button
        >
      </span>
    </div>
  {/each}
  <button
    class="toggle"
    data-testid="add-group"
    onclick={() => assign.groups.push({ name: `group ${assign.groups.length + 1}`, children: [] })}
  >
    add a group
  </button>
{:else if branch}
  <h2>Branch</h2>
  <p class="help">
    Sends participants down one of two paths depending on how they did earlier. The trials being
    judged must come before this step.
  </p>
  <div class="field">
    <label for="branch-scope"><span class="name">judge trials tagged</span></label>
    <input
      id="branch-scope"
      data-testid="branch-scope"
      value={branch.when.scope}
      onchange={(event) => (branch.when.scope = event.currentTarget.value)}
    />
  </div>
  <div class="field">
    <label for="branch-comparison"><span class="name">take the first path when</span></label>
    <select
      id="branch-comparison"
      data-testid="branch-comparison"
      value={branchComparison}
      onchange={(event) => setBranchComparison(event.currentTarget.value)}
    >
      <option value="at_least">accuracy is at least</option>
      <option value="below">accuracy is below</option>
    </select>
  </div>
  <div class="field">
    <label for="branch-threshold"><span class="name">threshold</span></label>
    <input
      id="branch-threshold"
      data-testid="branch-threshold"
      type="number"
      min="0"
      max="1"
      step="0.05"
      value={branch.when.accuracy_at_least ?? branch.when.accuracy_below ?? 0.8}
      onchange={(event) => setBranchThreshold(event.currentTarget.valueAsNumber)}
    />
  </div>
{:else if checkpoint}
  <h2>Checkpoint</h2>
  <p class="help">Records that the participant got this far, for drop-out analysis.</p>
  <div class="field">
    <label for="checkpoint-name"><span class="name">name</span></label>
    <input
      id="checkpoint-name"
      data-testid="checkpoint-name"
      value={checkpoint.name}
      onchange={(event) => (checkpoint.name = event.currentTarget.value)}
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
  .group-row {
    display: flex;
    gap: 0.3rem;
  }
  .group-row input {
    flex: 1;
  }
  .group-row button {
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
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
  .problems {
    margin: 0 0 0.5rem;
    padding-left: 1rem;
    color: var(--accent);
    font-size: 0.85rem;
  }
  .empty,
  .help {
    color: var(--muted);
  }
</style>
