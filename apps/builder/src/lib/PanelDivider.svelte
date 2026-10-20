<script lang="ts">
  import { dragBoundary, panels, resetPanels } from "./panels.svelte.ts";

  interface Props {
    index: number;
    label: string;
  }

  const { index, label }: Props = $props();

  const KEYBOARD_STEP = 2;

  function startDrag(event: PointerEvent) {
    const handle = event.currentTarget as HTMLElement;
    const rowWidth = handle.parentElement?.getBoundingClientRect().width ?? 1;
    let previous = event.clientX;
    handle.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      dragBoundary(index, ((moveEvent.clientX - previous) / rowWidth) * 100);
      previous = moveEvent.clientX;
    };
    const stop = () => {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowLeft") dragBoundary(index, -KEYBOARD_STEP);
    else if (event.key === "ArrowRight") dragBoundary(index, KEYBOARD_STEP);
    else return;
    event.preventDefault();
  }
</script>

<!-- A focusable separator is the ARIA window-splitter pattern: it is interactive by design, which
     the generic non-interactive-element rules do not account for. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="divider"
  role="separator"
  aria-orientation="vertical"
  aria-label={label}
  aria-valuenow={Math.round(panels.widths[index])}
  aria-valuemin="12"
  aria-valuemax="88"
  tabindex="0"
  data-testid={`divider-${index}`}
  onpointerdown={startDrag}
  onkeydown={onKeydown}
  ondblclick={resetPanels}
  title="Drag to resize, double-click to reset"
></div>

<style>
  .divider {
    cursor: col-resize;
    position: relative;
    width: 0.5rem;
    margin: 0 -0.25rem;
    z-index: 1;
    touch-action: none;
  }
  .divider::after {
    content: "";
    position: absolute;
    inset: 0 calc(50% - 1px);
    background: var(--line);
    border-radius: var(--radius-sm);
  }
  .divider:hover::after,
  .divider:focus-visible::after {
    background: var(--signal);
    inset: 0 calc(50% - 2px);
  }
</style>
