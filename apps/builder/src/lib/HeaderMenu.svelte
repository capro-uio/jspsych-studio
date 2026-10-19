<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    label: string;
    id?: string;
    children: Snippet<[close: () => void]>;
  }

  const { label, id, children }: Props = $props();

  let open = $state(false);
  let container: HTMLDivElement | undefined = $state();

  // A menu that stays open after you have gone elsewhere is a menu in the way.
  $effect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (container && !container.contains(event.target as Node)) open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") open = false;
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  });
</script>

<div class="menu" bind:this={container}>
  <button
    class="toggle"
    {id}
    data-testid="header-menu"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={label}
    onclick={() => (open = !open)}>⋯</button
  >
  {#if open}
    <div class="items" role="menu" data-testid="header-menu-items">
      {@render children(() => (open = false))}
    </div>
  {/if}
</div>

<style>
  .menu {
    position: relative;
  }
  .toggle {
    border: 0;
    background: none;
    cursor: pointer;
    color: var(--muted);
    padding: 0.2rem 0.45rem;
    font-size: 1rem;
    line-height: 1;
  }
  .items {
    position: absolute;
    right: 0;
    top: calc(100% + 0.3rem);
    z-index: 10;
    min-width: 13rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.3rem;
    background: var(--bg);
    border: 1px solid var(--rule);
    border-radius: 6px;
    box-shadow: 0 6px 18px rgb(0 0 0 / 18%);
  }
</style>
