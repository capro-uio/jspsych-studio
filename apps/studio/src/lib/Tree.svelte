<script lang="ts">
  import { slotsOf } from "@jspsych-studio/compiler";
  import type { SpecNode } from "@jspsych-studio/compiler";
  import Tree from "./Tree.svelte";
  import {
    conditionColumns,
    isInsertionAt,
    moveNode,
    project,
    removeNode,
    setInsertion,
    type NodePath,
  } from "./project.svelte.ts";

  interface Props {
    nodes: SpecNode[];
    path?: NodePath;
    inGroup?: boolean;
  }

  const { nodes, path = [], inGroup = false }: Props = $props();

  function describeAccuracy(rule: {
    scope: string;
    accuracy_below?: number;
    accuracy_at_least?: number;
  }) {
    const below = rule.accuracy_at_least === undefined;
    const threshold = below ? (rule.accuracy_below ?? 0) : rule.accuracy_at_least!;
    return `${below ? "under" : "at least"} ${Math.round(threshold * 100)}% on ${rule.scope || "…"}`;
  }

  function label(node: SpecNode) {
    if (node.kind === "trial") return node.plugin + (node.tag ? ` · ${node.tag}` : "");
    if (node.kind === "block") {
      const rows = (project.spec.conditions?.[node.conditions] ?? []).length;
      const repeats = node.repetitions && node.repetitions > 1 ? ` × ${node.repetitions}` : "";
      return `once for each of ${rows} rows${repeats} · ${node.conditions}`;
    }
    if (node.kind === "checkpoint") return `reached “${node.name}”`;
    if (node.kind === "assign") {
      return `${node.groups.map((group) => group.name).join(" or ")} · ${node.method}`;
    }
    if (node.kind === "branch") return `if accuracy ${describeAccuracy(node.when)}`;
    return `repeat while accuracy ${describeAccuracy(node.repeat_while)}`;
  }

  const slotId = (index: number) => `slot-${[...path, index].join("-")}`;

  const isSelected = (childPath: NodePath) => project.selection?.join(".") === childPath.join(".");
</script>

<ul>
  {#each nodes as node, index (node)}
    <li class="slot-row">
      <button
        class="slot"
        class:active={isInsertionAt(path, index)}
        data-testid={slotId(index)}
        title="Add here"
        onclick={() => setInsertion(path, index)}
      ></button>
    </li>
    {@const childPath = [...path, index]}
    <li>
      <div class="row" class:selected={isSelected(childPath)}>
        <button
          class="label"
          data-testid={`node-${childPath.join("-")}`}
          onclick={() => (project.selection = childPath)}
        >
          <span class="kind">{node.kind}</span>
          {label(node)}
        </button>
        <span class="controls">
          <button title="move up" onclick={() => moveNode(childPath, -1)}>↑</button>
          <button title="move down" onclick={() => moveNode(childPath, 1)}>↓</button>
          <button
            title="delete"
            data-testid={`delete-${childPath.join("-")}`}
            onclick={() => removeNode(childPath)}>✕</button
          >
        </span>
      </div>
      {#if slotsOf(node)}
        {#each slotsOf(node) ?? [] as slot, slotIndex (slotIndex)}
          <div class="group">
            <button
              class="group-name"
              class:selected={isSelected([...childPath, slotIndex])}
              data-testid={`group-${[...childPath, slotIndex].join("-")}`}
              onclick={() => (project.selection = [...childPath, slotIndex])}
            >
              {slot.name}
            </button>
            <Tree nodes={slot.children} path={[...childPath, slotIndex]} inGroup />
          </div>
        {/each}
      {:else if node.kind === "block" || node.kind === "loop"}
        <Tree nodes={node.children} path={childPath} />
      {/if}
    </li>
  {/each}
  <li class="slot-row">
    <button
      class="slot"
      class:active={isInsertionAt(path, nodes.length)}
      data-testid={slotId(nodes.length)}
      title="Add here"
      onclick={() => setInsertion(path, nodes.length)}
    ></button>
  </li>
</ul>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding-left: 0.9rem;
  }
  .row {
    display: flex;
    gap: 0.3rem;
    align-items: center;
    border-radius: 4px;
    padding: 0.1rem 0.2rem;
  }
  .row.selected {
    background: var(--selected);
  }
  .slot-row {
    height: 0.55rem;
    display: flex;
    align-items: center;
  }
  .slot {
    flex: 1;
    height: 100%;
    border: 0;
    background: none;
    cursor: copy;
    border-radius: 2px;
    padding: 0;
  }
  .slot::after {
    content: "";
    display: block;
    height: 2px;
    border-radius: 2px;
    background: transparent;
  }
  .slot:hover::after {
    background: color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .slot.active::after {
    background: var(--accent);
  }
  .group {
    border-left: 2px solid var(--rule);
    margin-left: 0.5rem;
    padding-left: 0.2rem;
  }
  .group-name {
    font-size: 0.75rem;
    color: var(--muted);
    background: none;
    border: 0;
    cursor: pointer;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
  }
  .group-name.selected {
    background: var(--selected);
    color: inherit;
  }
  .label {
    flex: 1;
    text-align: left;
    background: none;
    border: 0;
    padding: 0.2rem;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .kind {
    font-size: 0.7rem;
    text-transform: uppercase;
    color: var(--muted);
    margin-right: 0.35rem;
  }
  .controls button {
    background: none;
    border: 0;
    cursor: pointer;
    color: var(--muted);
    padding: 0.1rem 0.2rem;
  }
  .controls button:hover {
    color: var(--accent);
  }
</style>
