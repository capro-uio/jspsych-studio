<script lang="ts">
  interface Props {
    value: string;
    testId: string;
    onchange: (value: string) => void;
  }

  const { value, testId, onchange }: Props = $props();

  let editor: HTMLDivElement | undefined = $state();
  let editingMarkup = $state(false);
  let markup = $state("");

  // The editable surface holds the document; rewriting it from `value` on every keystroke would
  // move the caret, so it is only seeded when the step being edited changes underneath it.
  $effect(() => {
    if (!editor || editingMarkup) return;
    if (editor.innerHTML !== value) editor.innerHTML = value ?? "";
  });

  function publish() {
    if (editor) onchange(editor.innerHTML);
  }

  function format(command: string, argument?: string) {
    editor?.focus();
    document.execCommand(command, false, argument);
    publish();
  }

  function toggleMarkup() {
    if (editingMarkup) {
      onchange(markup);
      editingMarkup = false;
      return;
    }
    markup = value ?? "";
    editingMarkup = true;
  }

  const SIZES = [
    { label: "normal", value: "" },
    { label: "large", value: "32px" },
    { label: "huge", value: "48px" },
  ];
</script>

<div class="rich">
  <div class="toolbar">
    <button
      type="button"
      title="Bold"
      data-testid={`${testId}-bold`}
      onclick={() => format("bold")}
    >
      <b>B</b>
    </button>
    <button
      type="button"
      title="Italic"
      data-testid={`${testId}-italic`}
      onclick={() => format("italic")}><i>I</i></button
    >
    <select
      title="Text size"
      data-testid={`${testId}-size`}
      onchange={(event) => {
        const size = event.currentTarget.value;
        format("fontSize", "7");
        // execCommand only offers seven sizes, so the chosen pixel size replaces the font tag it
        // leaves behind.
        editor?.querySelectorAll('font[size="7"]').forEach((node) => {
          const span = document.createElement("span");
          if (size) span.style.fontSize = size;
          span.innerHTML = node.innerHTML;
          node.replaceWith(span);
        });
        publish();
      }}
    >
      {#each SIZES as size (size.label)}
        <option value={size.value}>{size.label}</option>
      {/each}
    </select>
    <input
      type="color"
      title="Text colour"
      data-testid={`${testId}-colour`}
      onchange={(event) => format("foreColor", event.currentTarget.value)}
    />
    <button
      type="button"
      title="Centre"
      data-testid={`${testId}-center`}
      onclick={() => format("justifyCenter")}>≡</button
    >
    <button
      type="button"
      title="Remove formatting"
      data-testid={`${testId}-clear`}
      onclick={() => format("removeFormat")}>⌫</button
    >
    <span class="spacer"></span>
    <button
      type="button"
      class="markup"
      title="Edit the HTML directly"
      data-testid={`${testId}-markup`}
      onclick={toggleMarkup}>{editingMarkup ? "done" : "HTML"}</button
    >
  </div>

  {#if editingMarkup}
    <textarea
      class="markup-area"
      data-testid={`${testId}-html`}
      bind:value={markup}
      onchange={() => onchange(markup)}></textarea>
  {:else}
    <div
      class="surface"
      contenteditable="true"
      role="textbox"
      tabindex="0"
      aria-multiline="true"
      data-testid={testId}
      bind:this={editor}
      oninput={publish}
      onblur={publish}
    ></div>
  {/if}
</div>

<style>
  .rich {
    border: 1px solid var(--rule);
    border-radius: 4px;
    overflow: hidden;
  }
  .toolbar {
    display: flex;
    gap: 0.2rem;
    align-items: center;
    padding: 0.2rem;
    border-bottom: 1px solid var(--rule);
    background: color-mix(in srgb, var(--rule) 25%, transparent);
  }
  .toolbar button {
    border: 0;
    background: none;
    padding: 0.1rem 0.35rem;
    cursor: pointer;
    border-radius: 3px;
  }
  .toolbar button:hover {
    background: var(--selected);
  }
  .toolbar select,
  .toolbar input[type="color"] {
    border: 0;
    background: none;
    padding: 0;
  }
  .toolbar input[type="color"] {
    width: 1.6rem;
    height: 1.4rem;
  }
  .spacer {
    flex: 1;
  }
  .markup {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .surface,
  .markup-area {
    display: block;
    width: 100%;
    min-height: 6.5rem;
    max-height: 18rem;
    overflow: auto;
    padding: 0.45rem;
    border: 0;
    font: inherit;
    resize: vertical;
  }
  .surface:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .markup-area {
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
  }
</style>
