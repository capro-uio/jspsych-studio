<script lang="ts">
  import {
    addAtInsertion,
    conditionTableNames,
    isInsertionAt,
    newBlock,
    newBranch,
    newCheckpoint,
    newCounterbalance,
    newEnd,
    newLoop,
    newTrial,
    setInsertion,
    type NodePath,
  } from "./project.svelte.ts";
  import type { SpecNode } from "@jspsych-studio/compiler";
  import { newAssign } from "./project.svelte.ts";
  import { startingParams } from "./schemas.ts";

  interface Props {
    path: NodePath;
    index: number;
  }

  const { path, index }: Props = $props();

  const DEFAULT_PLUGIN = "html-keyboard-response";
  const testId = $derived(`slot-${[...path, index].join("-")}`);

  let open = $state(false);

  const tables = $derived(conditionTableNames());
  const trial = () => newTrial(DEFAULT_PLUGIN, startingParams(DEFAULT_PLUGIN));

  const choices = $derived([
    { id: "trial", label: "Trial", hint: "show something and collect a response", make: trial },
    {
      id: "block",
      label: "Block",
      hint: tables.length > 0 ? "repeat steps once per row of a table" : "needs a conditions table",
      disabled: tables.length === 0,
      make: () => newBlock(tables[0], trial()),
    },
    {
      id: "loop",
      label: "Loop",
      hint: "repeat steps until performance is good enough",
      make: () => newLoop(trial()),
    },
    {
      id: "assign",
      label: "Split",
      hint: "send each participant down one of several paths",
      make: () => newAssign(trial(), trial()),
    },
    {
      id: "counterbalance",
      label: "Counterbalance",
      hint: "run several tasks in an order that differs between participants",
      make: () => newCounterbalance(trial(), trial()),
    },
    {
      id: "branch",
      label: "Branch",
      hint: "choose a path based on how they did",
      make: () => newBranch(trial()),
    },
    {
      id: "checkpoint",
      label: "Checkpoint",
      hint: "record that they got this far",
      make: newCheckpoint,
    },
    {
      id: "end",
      label: "End",
      hint: "finish the study here, e.g. when consent is declined",
      make: newEnd,
    },
  ]);

  function add(make: () => SpecNode) {
    setInsertion(path, index);
    addAtInsertion(make());
    open = false;
  }
</script>

<div class="slot-row">
  <button
    class="slot"
    class:active={isInsertionAt(path, index) || open}
    data-testid={testId}
    title="Add a step here"
    aria-label="Add a step here"
    aria-expanded={open}
    onclick={() => {
      setInsertion(path, index);
      open = !open;
    }}>+</button
  >
</div>

{#if open}
  <div class="menu" data-testid={`${testId}-menu`}>
    {#each choices as choice (choice.id)}
      <button
        data-testid={`${testId}-${choice.id}`}
        disabled={choice.disabled}
        onclick={() => add(choice.make)}
      >
        <strong>{choice.label}</strong>
        <span>{choice.hint}</span>
      </button>
    {/each}
    <button class="cancel" data-testid={`${testId}-cancel`} onclick={() => (open = false)}>
      cancel
    </button>
  </div>
{/if}

<style>
  .slot-row {
    height: 0.9rem;
    display: flex;
    align-items: center;
  }
  .slot {
    flex: 1;
    height: 100%;
    border: 0;
    background: none;
    cursor: copy;
    padding: 0;
    color: transparent;
    font-size: 0.75rem;
    line-height: 1;
    border-top: 2px solid transparent;
  }
  .slot:hover,
  .slot.active {
    color: var(--accent);
    border-top-color: color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .slot.active {
    border-top-color: var(--accent);
  }
  .menu {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    border: 1px solid var(--rule);
    border-radius: 4px;
    padding: 0.25rem;
    margin: 0.15rem 0;
  }
  .menu button {
    display: flex;
    flex-direction: column;
    text-align: left;
    border: 0;
    background: none;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 3px;
    font-size: 0.85rem;
  }
  .menu button:hover:not(:disabled) {
    background: var(--selected);
  }
  .menu button span {
    color: var(--muted);
    font-size: 0.75rem;
  }
  .menu button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .cancel {
    color: var(--muted);
    font-size: 0.75rem;
  }
</style>
