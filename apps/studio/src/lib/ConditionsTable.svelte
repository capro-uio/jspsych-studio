<script lang="ts">
  import { conditionColumns, project } from "./project.svelte.ts";

  let tableName = $state("");
  let pasted = $state("");
  let message = $state("");
  let open = $state<string | null>(null);

  const tables = $derived(Object.entries(project.spec.conditions ?? {}));

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
      open = tableName;
      pasted = "";
      tableName = "";
    } catch (error) {
      message = (error as Error).message;
    }
  }

  function rowsOf(name: string) {
    return project.spec.conditions?.[name] ?? [];
  }

  function setCell(name: string, index: number, column: string, value: string) {
    rowsOf(name)[index][column] = value;
  }

  function addRow(name: string) {
    const columns = conditionColumns(name);
    rowsOf(name).push(Object.fromEntries(columns.map((column) => [column, ""])));
  }

  function removeRow(name: string, index: number) {
    rowsOf(name).splice(index, 1);
  }

  function addColumn(name: string) {
    const columns = conditionColumns(name);
    let column = "column";
    let suffix = 1;
    while (columns.includes(column)) column = `column ${++suffix}`;
    for (const row of rowsOf(name)) row[column] = "";
  }

  // Renaming rebuilds each row so the columns keep their order rather than moving to the end.
  function renameColumn(name: string, from: string, to: string) {
    if (!to || from === to || conditionColumns(name).includes(to)) return;
    project.spec.conditions![name] = rowsOf(name).map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([column, value]) => [column === from ? to : column, value]),
      ),
    );
  }

  function removeColumn(name: string, column: string) {
    for (const row of rowsOf(name)) delete row[column];
  }
</script>

<section>
  {#each tables as [name, rows] (name)}
    <div class="table">
      <button
        class="summary"
        data-testid={`open-table-${name}`}
        onclick={() => (open = open === name ? null : name)}
      >
        <span class="caret">{open === name ? "▾" : "▸"}</span>
        <strong>{name}</strong>
        <span class="muted">{rows.length} rows</span>
      </button>
      <button
        data-testid={`delete-table-${name}`}
        onclick={() => delete project.spec.conditions?.[name]}
      >
        ✕
      </button>
    </div>

    {#if open === name}
      <div class="grid" data-testid={`grid-${name}`}>
        <table>
          <thead>
            <tr>
              <th class="corner"></th>
              {#each conditionColumns(name) as column (column)}
                <th>
                  <input
                    data-testid={`column-name-${name}-${column}`}
                    value={column}
                    onchange={(event) => renameColumn(name, column, event.currentTarget.value)}
                  />
                  <button
                    title="remove column"
                    data-testid={`remove-column-${name}-${column}`}
                    onclick={() => removeColumn(name, column)}>✕</button
                  >
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each rows as row, index (index)}
              <tr>
                <td class="number">{index + 1}</td>
                {#each conditionColumns(name) as column (column)}
                  <td>
                    <input
                      data-testid={`cell-${name}-${index}-${column}`}
                      value={String(row[column] ?? "")}
                      onchange={(event) => setCell(name, index, column, event.currentTarget.value)}
                    />
                  </td>
                {/each}
                <td>
                  <button
                    title="remove row"
                    data-testid={`remove-row-${name}-${index}`}
                    onclick={() => removeRow(name, index)}>✕</button
                  >
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="grid-actions">
          <button data-testid={`add-row-${name}`} onclick={() => addRow(name)}>+ row</button>
          <button data-testid={`add-column-${name}`} onclick={() => addColumn(name)}
            >+ column</button
          >
        </div>
      </div>
    {/if}
  {/each}

  <input data-testid="table-name" placeholder="new table name" bind:value={tableName} />
  <textarea
    data-testid="table-rows"
    rows="3"
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
  .table {
    display: flex;
    gap: 0.3rem;
    align-items: center;
  }
  .summary {
    flex: 1;
    display: flex;
    gap: 0.35rem;
    align-items: baseline;
    text-align: left;
    border: 0;
    background: none;
    cursor: pointer;
    padding: 0.15rem;
  }
  .caret {
    color: var(--muted);
  }
  .table > button:last-child {
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .grid {
    overflow-x: auto;
    border: 1px solid var(--rule);
    border-radius: 4px;
    padding: 0.3rem;
  }
  table {
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  th,
  td {
    padding: 0.1rem;
  }
  th {
    white-space: nowrap;
  }
  th input {
    width: 6.5rem;
    font-weight: 600;
  }
  td input {
    width: 6.5rem;
  }
  .number,
  .corner {
    color: var(--muted);
    width: 1.2rem;
    text-align: right;
  }
  th button,
  td button {
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
    padding: 0 0.15rem;
  }
  .grid-actions {
    display: flex;
    gap: 0.3rem;
    margin-top: 0.3rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 0;
  }
</style>
