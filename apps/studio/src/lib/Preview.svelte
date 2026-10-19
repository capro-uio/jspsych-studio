<script lang="ts">
  import { compileSpec, emitHtml, formatSource, SpecError } from "@jspsych-studio/compiler";
  import type { Spec } from "@jspsych-studio/compiler";
  import { exportedSpec, project } from "./project.svelte.ts";
  import { FOCUS_GUARD, previewSpec } from "./preview.ts";
  import { currentProblems, overallProblems } from "./problems.svelte.ts";
  import { schemas } from "./schemas.ts";
  import Flow from "./Flow.svelte";

  type View = "experiment" | "flow" | "code" | "spec";

  const VIEWS = [
    { id: "experiment", label: "Experiment", hint: "What a participant sees" },
    { id: "flow", label: "Flow", hint: "How the study runs, step by step" },
    { id: "code", label: "Code", hint: "The jsPsych this builds, as it will be exported" },
    { id: "spec", label: "Project file", hint: "What the download and import use" },
  ] as const;

  let view = $state<View>("experiment");
  let html = $state("");
  let source = $state("");
  let exportedSource = $state("");
  let error = $state("");
  let runToken = $state(0);
  let latestCompile = 0;
  let fromSelected = $state(false);

  const REBUILD_DELAY_MS = 150;

  const specJson = $derived(JSON.stringify(exportedSpec(), null, 2));
  const selectionKey = $derived(project.selection?.join(".") ?? "");
  // Built from the key so the compiler gets plain numbers, and reselecting a step does not rebuild.
  const runningFrom = $derived(
    fromSelected && selectionKey ? selectionKey.split(".").map(Number) : null,
  );

  function rebuild(spec: Spec, from: number[] | null) {
    const compileId = ++latestCompile;
    try {
      // The experiment as it will be exported decides what is valid and what the code view shows.
      // What runs in the frame is a preview of it, which never saves data.
      const exported = compileSpec(spec, schemas);
      const running = compileSpec(previewSpec(spec, { from }), schemas, {
        initEntries: "on_finish: () => { window.studioExperiment.finished = true; }",
      });
      error = "";
      exportedSource = exported.source;
      emitHtml(running, { title: spec.name, headScripts: [FOCUS_GUARD] }).then(
        (output) => {
          if (compileId !== latestCompile) return;
          html = output.html;
        },
        (problem: unknown) => {
          if (compileId !== latestCompile) return;
          const reason = problem instanceof Error ? problem.message : String(problem);
          error = `The preview could not be built: ${reason}`;
          html = "";
        },
      );
    } catch (problem) {
      if (!(problem instanceof SpecError)) throw problem;
      error = problem.message;
      html = "";
      exportedSource = "";
    }
  }

  // Depending on the serialised spec does two jobs: it reads the whole tree, so edits nested deep
  // inside a timeline still invalidate the effect (a bare `exportedSpec()` only reads the top
  // level), and it hands the compiler plain objects rather than state proxies. Rebuilding once the
  // edit settles keeps the preview from recompiling and reformatting on every keystroke.
  $effect(() => {
    const json = specJson;
    const from = runningFrom;
    const timer = setTimeout(() => rebuild(JSON.parse(json) as Spec, from), REBUILD_DELAY_MS);
    return () => clearTimeout(timer);
  });

  // Formatting is only worth doing when someone is looking at the code.
  $effect(() => {
    if (view !== "code" || !exportedSource) return;
    const wanted = exportedSource;
    // Unformatted code is still the right code, so a formatter failure shows it as it is.
    formatSource(wanted).then(
      (formatted) => {
        if (wanted === exportedSource) source = formatted;
      },
      () => {
        if (wanted === exportedSource) source = wanted;
      },
    );
  });
</script>

<section>
  <div class="views" role="tablist">
    {#each VIEWS as option (option.id)}
      <button
        role="tab"
        aria-selected={view === option.id}
        class:active={view === option.id}
        data-testid={`view-${option.id}`}
        title={option.hint}
        onclick={() => (view = option.id)}>{option.label}</button
      >
    {/each}
  </div>

  {#if view === "experiment"}
    <div class="runbar">
      <div class="segmented" role="group" aria-label="What to run">
        <button
          class:active={!fromSelected}
          data-testid="run-whole"
          onclick={() => (fromSelected = false)}>Whole experiment</button
        >
        <button
          class:active={fromSelected}
          data-testid="run-from-step"
          disabled={!project.selection}
          title={project.selection
            ? "Run only the selected step, with the blocks it sits in"
            : "Select a step first"}
          onclick={() => (fromSelected = true)}>Selected step</button
        >
      </div>
      <button class="restart" data-testid="restart" onclick={() => (runToken += 1)}>
        ↻ Start again
      </button>
      <span class="spacer"></span>
      <span class="note" data-testid="preview-note"
        >Click into it to answer with keys. Nothing is saved from a preview</span
      >
    </div>
  {/if}

  {#if error}
    {@const problems = currentProblems()}
    {@const overall = overallProblems(problems)}
    <div class="error" data-testid="compile-error">
      {#if problems.length === 0}
        <p>{error}</p>
      {/if}
      {#each overall as problem (problem.message)}
        <p>{problem.message}</p>
      {/each}
      {#if problems.length > overall.length}
        <p data-testid="steps-need-attention">
          {problems.length - overall.length === 1
            ? "1 step needs"
            : `${problems.length - overall.length} steps need`} attention; each one says what it needs.
        </p>
      {/if}
    </div>
  {/if}

  {#if view === "experiment"}
    {#if html}
      {#key `${html}-${runToken}`}
        <iframe
          title="experiment preview"
          data-testid="preview"
          sandbox="allow-scripts allow-forms allow-modals"
          allow="autoplay"
          srcdoc={html}
        ></iframe>
      {/key}
    {:else}
      <p class="placeholder">Nothing to run yet.</p>
    {/if}
  {:else if view === "flow"}
    <Flow />
  {:else if view === "code"}
    <pre data-testid="generated-code">{source}</pre>
  {:else}
    <pre data-testid="spec-json">{specJson}</pre>
  {/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  /* Switching what you look at, and acting on what you see, are different things and look it. */
  .views {
    display: flex;
    gap: 0.15rem;
    border-bottom: 1px solid var(--rule);
  }
  .views button {
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    padding: 0.3rem 0.5rem;
    cursor: pointer;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .views button.active {
    color: inherit;
    border-bottom-color: var(--accent);
  }
  .runbar {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    padding: 0.4rem 0;
  }
  .segmented {
    display: flex;
  }
  .segmented button {
    border: 1px solid var(--rule);
    background: none;
    cursor: pointer;
    padding: 0.2rem 0.5rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .segmented button:first-child {
    border-radius: 4px 0 0 4px;
  }
  .segmented button:last-child {
    border-radius: 0 4px 4px 0;
    border-left: 0;
  }
  .segmented button.active {
    border-color: var(--accent);
    color: var(--accent);
  }
  .restart {
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 0.8rem;
  }
  .spacer {
    flex: 1;
  }
  .note {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .note {
    margin: 0 0 0.35rem;
    font-size: 0.78rem;
    color: var(--muted);
  }
  iframe {
    flex: 1;
    width: 100%;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--stimulus-background, #fff);
  }
  pre {
    flex: 1;
    overflow: auto;
    margin: 0;
    padding: 0.6rem;
    border: 1px solid var(--rule);
    border-radius: 6px;
    font-size: 0.78rem;
    white-space: pre-wrap;
  }
  .error {
    flex: 0 0 auto;
    max-height: 9rem;
    overflow: auto;
    margin-bottom: 0.4rem;
    padding: 0.5rem;
    border: 1px solid var(--accent);
    border-radius: 6px;
    color: var(--accent);
  }
  .error p {
    margin: 0 0 0.25rem;
  }
  .placeholder {
    color: var(--muted);
  }
</style>
