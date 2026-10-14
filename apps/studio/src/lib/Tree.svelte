<script lang="ts">
  import type { SpecNode } from "@jspsych-studio/compiler";
  import Tree from "./Tree.svelte";
  import { moveNode, project, removeNode, type NodePath } from "./project.svelte.ts";

  interface Props {
    nodes: SpecNode[];
    path?: NodePath;
  }

  const { nodes, path = [] }: Props = $props();

  function label(node: SpecNode) {
    if (node.kind === "trial") return node.plugin + (node.tag ? ` · ${node.tag}` : "");
    if (node.kind === "block") return `block over ${node.conditions}`;
    return `loop${node.id ? ` · ${node.id}` : ""}`;
  }

  const isSelected = (childPath: NodePath) => project.selection?.join(".") === childPath.join(".");
</script>

<ul>
  {#each nodes as node, index (node)}
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
      {#if node.kind !== "trial"}
        <Tree nodes={node.children} path={childPath} />
      {/if}
    </li>
  {/each}
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
