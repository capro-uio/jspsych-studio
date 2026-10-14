<script lang="ts">
  import type { ParameterSchema } from "@jspsych-studio/schemas";

  interface Props {
    name: string;
    parameter: ParameterSchema;
    assets: string[];
    values: unknown[];
    onchange: (values: unknown[]) => void;
  }

  const { name, parameter, assets, values, onchange }: Props = $props();

  const item = $derived(parameter.items ?? parameter);
  const multiline = $derived(item.jspsychType === "HTML_STRING");
  const media = $derived(["IMAGE", "AUDIO", "VIDEO"].includes(item.jspsychType));

  function update(index: number, value: unknown) {
    onchange(values.map((existing, position) => (position === index ? value : existing)));
  }

  function add() {
    onchange([...values, ""]);
  }

  function remove(index: number) {
    onchange(values.filter((_, position) => position !== index));
  }

  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= values.length) return;
    const reordered = [...values];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    onchange(reordered);
  }
</script>

<div class="list">
  {#each values as entry, index (index)}
    <div class="entry">
      <span class="position">{index + 1}</span>
      {#if media && assets.length > 0}
        <select
          data-testid={`value-${name}-${index}`}
          value={entry as string}
          onchange={(event) => update(index, event.currentTarget.value)}
        >
          <option value="">choose a file</option>
          {#each assets as file (file)}
            <option value={file}>{file}</option>
          {/each}
        </select>
      {:else if multiline}
        <textarea
          data-testid={`value-${name}-${index}`}
          rows="2"
          value={entry as string}
          onchange={(event) => update(index, event.currentTarget.value)}></textarea>
      {:else}
        <input
          data-testid={`value-${name}-${index}`}
          value={entry as string}
          onchange={(event) => update(index, event.currentTarget.value)}
        />
      {/if}
      <span class="controls">
        <button title="move up" onclick={() => move(index, -1)}>↑</button>
        <button title="move down" onclick={() => move(index, 1)}>↓</button>
        <button title="remove" data-testid={`remove-${name}-${index}`} onclick={() => remove(index)}
          >✕</button
        >
      </span>
    </div>
  {/each}
  <button class="add" data-testid={`add-${name}`} onclick={add}>+ add</button>
</div>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .entry {
    display: flex;
    gap: 0.3rem;
    align-items: start;
  }
  .entry :global(textarea),
  .entry input,
  .entry select {
    flex: 1;
  }
  .position {
    color: var(--muted);
    font-size: 0.75rem;
    padding-top: 0.35rem;
    min-width: 1rem;
  }
  .controls button {
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
    padding: 0.1rem 0.2rem;
  }
  .add {
    align-self: start;
    font-size: 0.8rem;
    color: var(--muted);
  }
</style>
