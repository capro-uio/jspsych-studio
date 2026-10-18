<script lang="ts">
  import { codeProblem } from "@jspsych-studio/compiler";

  interface Props {
    code: string;
    label: string;
    hint: string;
    testId: string;
    onchange: (code: string) => void;
  }

  const { code, label, hint, testId, onchange }: Props = $props();

  // The draft follows the saved code, and is saved when the author leaves the box, so a half-typed
  // expression does not rebuild the preview on every key.
  let draft = $derived(code);
  const problem = $derived(draft.trim() === "" ? null : codeProblem(draft));
  const rows = $derived(Math.min(12, Math.max(3, draft.split("\n").length)));
</script>

<div class="code">
  <textarea
    data-testid={testId}
    aria-label={label}
    aria-invalid={problem !== null}
    aria-describedby={`${testId}-note`}
    spellcheck="false"
    autocapitalize="off"
    autocomplete="off"
    {rows}
    value={draft}
    oninput={(event) => (draft = event.currentTarget.value)}
    onchange={() => onchange(draft)}></textarea>
  <p id={`${testId}-note`} class:problem data-testid={`${testId}-note`}>
    {problem ? `This code ${problem}.` : hint}
  </p>
</div>

<style>
  .code {
    display: grid;
    gap: 0.2rem;
  }
  textarea {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.82rem;
    line-height: 1.4;
    tab-size: 2;
    resize: vertical;
    width: 100%;
    box-sizing: border-box;
  }
  textarea[aria-invalid="true"] {
    border-color: var(--accent);
  }
  p {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
  p.problem {
    color: var(--accent);
  }
</style>
