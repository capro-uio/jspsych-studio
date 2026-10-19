<script lang="ts">
  import type { ParameterSchema } from "@jspsych-studio/schemas";
  import {
    addColumn,
    addRow,
    isSquares,
    removeColumn,
    removeRow,
    setCell,
    type Grid,
  } from "./grid.ts";

  interface Props {
    name: string;
    testId: string;
    parameter: ParameterSchema;
    value: Grid;
    onchange: (grid: Grid) => void;
  }

  const { name, testId, parameter, value, onchange }: Props = $props();

  const cell = $derived(parameter.items?.items ?? parameter);
  const squares = $derived(isSquares(cell));
</script>

<div class="grid-field">
  <table data-testid={testId} aria-label={`${name}: ${squares ? "squares" : "keys"} by row`}>
    <tbody>
      {#each value as row, rowIndex (rowIndex)}
        <tr>
          {#each row as entry, columnIndex (columnIndex)}
            <td>
              {#if squares}
                <input
                  type="checkbox"
                  aria-label={`square at row ${rowIndex + 1}, column ${columnIndex + 1}`}
                  data-testid={`${testId}-${rowIndex}-${columnIndex}`}
                  checked={entry === 1}
                  onchange={(event) =>
                    onchange(
                      setCell(value, rowIndex, columnIndex, event.currentTarget.checked ? 1 : 0),
                    )}
                />
              {:else}
                <input
                  class="key"
                  aria-label={`key at row ${rowIndex + 1}, column ${columnIndex + 1}`}
                  data-testid={`${testId}-${rowIndex}-${columnIndex}`}
                  value={typeof entry === "string" ? entry : ""}
                  onchange={(event) =>
                    onchange(setCell(value, rowIndex, columnIndex, event.currentTarget.value))}
                />
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="controls">
    <button
      type="button"
      data-testid={`${testId}-add-row`}
      onclick={() => onchange(addRow(value, cell))}>+ row</button
    >
    <button
      type="button"
      data-testid={`${testId}-add-column`}
      onclick={() => onchange(addColumn(value, cell))}>+ column</button
    >
    <button
      type="button"
      data-testid={`${testId}-remove-row`}
      onclick={() => onchange(removeRow(value))}>− row</button
    >
    <button
      type="button"
      data-testid={`${testId}-remove-column`}
      onclick={() => onchange(removeColumn(value))}>− column</button
    >
  </div>
</div>

<style>
  .grid-field {
    display: grid;
    gap: 0.3rem;
    justify-items: start;
  }
  table {
    border-collapse: collapse;
  }
  td {
    padding: 0.15rem;
    text-align: center;
  }
  .key {
    width: 2.5rem;
    text-align: center;
  }
  .controls {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }
</style>
