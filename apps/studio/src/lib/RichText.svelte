<script lang="ts">
  import { runsScript } from "./html.ts";

  interface Props {
    value: string;
    testId: string;
    onchange: (value: string) => void;
  }

  const { value, testId, onchange }: Props = $props();

  // Markup that would run script, from a project someone else made say, is never put into the
  // editable surface, which is part of the builder's own page. It is edited as HTML instead.
  const holdsScript = $derived(runsScript(value ?? ""));

  let editor: HTMLDivElement | undefined = $state();
  let editingMarkup = $state(false);
  let markup = $state("");

  // Opening the colour picker or a menu takes focus away and drops the selection with it, so the
  // last selection made inside this editor is remembered and put back before a command runs.
  let savedRange: Range | null = null;

  function rememberSelection() {
    const selection = document.getSelection();
    if (!selection?.rangeCount || !editor) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedRange = range.cloneRange();
  }

  function restoreSelection() {
    if (!editor) return;
    editor.focus();
    const selection = document.getSelection();
    if (!selection) return;
    // With nothing selected, a formatting choice is meant for the whole field rather than for
    // nothing at all.
    if (!savedRange || savedRange.collapsed) {
      const whole = document.createRange();
      whole.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(whole);
      return;
    }
    selection.removeAllRanges();
    selection.addRange(savedRange);
  }

  // The editable surface holds the document; rewriting it from `value` on every keystroke would
  // move the caret, so it is only seeded when the step being edited changes underneath it.
  function seedFromValue(surface: HTMLDivElement) {
    if (runsScript(value ?? "")) return;
    if (surface.innerHTML !== value) surface.innerHTML = value ?? "";
  }

  function publish() {
    if (editor) onchange(editor.innerHTML);
  }

  function format(command: string, argument?: string) {
    restoreSelection();
    // Emit inline styles rather than <font> tags, which are easier to read in the HTML view.
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, argument);
    rememberSelection();
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
  {#if holdsScript}
    <p class="script-note" data-testid={`${testId}-script-note`}>
      This text holds script, so it is shown as HTML. It runs for participants, but not here.
    </p>
    <textarea
      class="markup-area"
      aria-label="HTML"
      data-testid={`${testId}-html`}
      value={value ?? ""}
      onchange={(event) => onchange(event.currentTarget.value)}></textarea>
  {:else}
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
        onpointerdown={(event) => event.preventDefault()}
        onclick={() => format("italic")}><i>I</i></button
      >
      <select
        title="Text size"
        data-testid={`${testId}-size`}
        onchange={(event) => {
          const size = event.currentTarget.value;
          restoreSelection();
          document.execCommand("styleWithCSS", false, "true");
          document.execCommand("fontSize", false, "7");
          // execCommand only offers seven sizes, so the chosen pixel size replaces whatever marker
          // it left behind.
          editor
            ?.querySelectorAll('font[size="7"], span[style*="xxx-large"], span[style*="x-large"]')
            .forEach((node) => {
              const span = document.createElement("span");
              // Keep whatever else was applied to this run of text; only the size is being changed.
              span.setAttribute("style", node.getAttribute("style") ?? "");
              span.style.fontSize = size;
              span.innerHTML = node.innerHTML;
              node.replaceWith(
                span.style.cssText
                  ? span
                  : document.createRange().createContextualFragment(node.innerHTML),
              );
            });
          rememberSelection();
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
        onpointerdown={(event) => event.preventDefault()}
        onclick={() => format("justifyCenter")}>≡</button
      >
      <button
        type="button"
        title="Remove formatting"
        data-testid={`${testId}-clear`}
        onpointerdown={(event) => event.preventDefault()}
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
        {@attach seedFromValue}
        oninput={publish}
        onkeyup={rememberSelection}
        onmouseup={rememberSelection}
        onblur={() => {
          rememberSelection();
          publish();
        }}
      ></div>
    {/if}
  {/if}
</div>

<style>
  .rich {
    border: 1px solid var(--rule);
    border-radius: 4px;
    overflow: hidden;
  }
  .script-note {
    margin: 0;
    padding: 0.3rem 0.4rem;
    font-size: 0.78rem;
    color: var(--muted);
    border-bottom: 1px solid var(--rule);
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
  /* Text is written against the backdrop the participant will see it on, so a colour that would
     vanish in the experiment looks wrong here too rather than the other way round. */
  .surface {
    background: var(--stimulus-background, #fff);
    color: var(--stimulus-text, #000);
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
