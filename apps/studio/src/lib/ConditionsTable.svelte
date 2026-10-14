<script lang="ts">
  import { conditionTableNames, project } from "./project.svelte.ts";

  let tableName = $state("");
  let pasted = $state("");
  let message = $state("");

  function parseDelimited(text: string) {
    const lines = text
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) throw new Error("needs a header row and at least one data row");
    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const headers = lines[0].split(delimiter).map((header) => header.trim());
    return lines.slice(1).map((line) => {
      const cells = line.split(delimiter).map((cell) => cell.trim());
      return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    });
  }

  function addTable() {
    try {
      const rows = parseDelimited(pasted);
      project.spec.conditions ??= {};
      project.spec.conditions[tableName] = rows;
      message = `${tableName}: ${rows.length} rows, ${Object.keys(rows[0]).length} columns`;
      pasted = "";
    } catch (error) {
      message = (error as Error).message;
    }
  }
</script>

<section>
  <h2>Conditions</h2>
  {#each conditionTableNames() as name (name)}
    <div class="table">
      <strong>{name}</strong>
      <span class="muted">{project.spec.conditions?.[name].length} rows</span>
      <button
        data-testid={`delete-table-${name}`}
        onclick={() => delete project.spec.conditions?.[name]}>✕</button
      >
    </div>
  {/each}

  <input data-testid="table-name" placeholder="table name" bind:value={tableName} />
  <textarea
    data-testid="table-rows"
    rows="4"
    placeholder="Paste CSV or TSV with a header row"
    bind:value={pasted}></textarea>
  <button data-testid="add-table" disabled={!tableName || !pasted} onclick={addTable}>
    Add table
  </button>
  {#if message}<p class="muted" data-testid="table-message">{message}</p>{/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
  }
  .table {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .muted {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 0;
  }
  .table button {
    margin-left: auto;
    background: none;
    border: 0;
    cursor: pointer;
    color: var(--muted);
  }
</style>
