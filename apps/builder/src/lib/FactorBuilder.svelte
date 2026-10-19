<script lang="ts">
  import { crossFactors, rowCount, MANY_ROWS, type Factor } from "./factors.ts";
  import { project } from "./project.svelte.ts";

  interface Props {
    onbuilt: (name: string) => void;
  }

  const { onbuilt }: Props = $props();

  let tableName = $state("");
  let factors = $state<Factor[]>([
    { name: "", levels: "" },
    { name: "", levels: "" },
  ]);
  let problems = $state<string[]>([]);

  const planned = $derived(rowCount(factors));
  const columns = $derived(
    factors
      .map((factor) => factor.name.trim())
      .filter(Boolean)
      .join(", "),
  );

  function build() {
    const { rows, problems: found } = crossFactors(factors);
    problems = found;
    if (!tableName.trim()) problems = [...problems, "the table needs a name"];
    if (problems.length > 0) return;

    project.spec.conditions ??= {};
    project.spec.conditions[tableName.trim()] = rows;
    onbuilt(tableName.trim());
    tableName = "";
    factors = [
      { name: "", levels: "" },
      { name: "", levels: "" },
    ];
  }
</script>

<section>
  <p class="muted">
    A conditions table holds one row per kind of trial. Name what changes between trials and the
    values it takes; every combination becomes a row.
  </p>

  <input data-testid="factor-table-name" placeholder="table name" bind:value={tableName} />

  {#each factors as factor, index (index)}
    <div class="factor">
      <input
        data-testid={`factor-name-${index}`}
        placeholder={index === 0 ? "what changes, e.g. word" : "another thing, e.g. ink"}
        bind:value={factor.name}
      />
      <input
        data-testid={`factor-levels-${index}`}
        placeholder={index === 0 ? "its values, e.g. RED, BLUE" : "e.g. red, blue"}
        bind:value={factor.levels}
      />
      <button
        title="remove"
        data-testid={`remove-factor-${index}`}
        disabled={factors.length <= 1}
        onclick={() => factors.splice(index, 1)}>✕</button
      >
    </div>
  {/each}

  <div class="actions">
    <button data-testid="add-factor" onclick={() => factors.push({ name: "", levels: "" })}>
      + another
    </button>
    <span class="spacer"></span>
    <span class="muted" data-testid="factor-preview">
      {planned > 0 ? `${planned} rows: ${columns}` : "nothing to build yet"}
    </span>
  </div>

  {#if planned > MANY_ROWS}
    <p class="warn" data-testid="factor-warning">
      That is {planned} rows. Blocks can repeat a smaller table instead of listing every trial.
    </p>
  {/if}

  <button data-testid="build-table" disabled={planned === 0} onclick={build}>Build table</button>

  {#each problems as problem (problem)}
    <p class="warn" data-testid="factor-problem">{problem}</p>
  {/each}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .factor {
    display: flex;
    gap: 0.3rem;
  }
  .factor input {
    flex: 1;
    min-width: 0;
  }
  .factor button {
    border: 0;
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
  }
  .actions {
    display: flex;
    gap: 0.3rem;
    align-items: center;
  }
  .spacer {
    flex: 1;
  }
  .muted {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
  .warn {
    margin: 0;
    font-size: 0.8rem;
    color: var(--caution);
  }
</style>
