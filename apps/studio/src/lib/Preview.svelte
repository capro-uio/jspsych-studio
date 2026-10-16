<script lang="ts">
  import { compileSpec, emitHtml, formatSource, SpecError } from "@jspsych-studio/compiler";
  import type { Spec } from "@jspsych-studio/compiler";
  import { exportedSpec, project } from "./project.svelte.ts";
  import { previewSpec } from "./preview.ts";
  import { currentProblems, overallProblems } from "./problems.svelte.ts";
  import { schemas } from "./schemas.ts";

  type View = "experiment" | "code" | "spec";

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
  const runningFrom = $derived(fromSelected && project.selection ? project.selection : null);

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
      emitHtml(running, { title: spec.name }).then((output) => {
        if (compileId !== latestCompile) return;
        html = output.html;
      });
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
    // Reading the key as well keeps the preview following the selection while running from a step.
    selectionKey;
    const timer = setTimeout(() => rebuild(JSON.parse(json), from), REBUILD_DELAY_MS);
    return () => clearTimeout(timer);
  });

  // Formatting is only worth doing when someone is looking at the code.
  $effect(() => {
    if (view !== "code" || !exportedSource) return;
    const wanted = exportedSource;
    formatSource(wanted).then((formatted) => {
      if (wanted === exportedSource) source = formatted;
    });
  });

  function download(filename: string, contents: string, type: string) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = Object.assign(document.createElement("a"), { href: url, download: filename });
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<section>
  <nav>
    {#each ["experiment", "code", "spec"] as const as option (option)}
      <button
        class:active={view === option}
        data-testid={`view-${option}`}
        onclick={() => (view = option)}>{option}</button
      >
    {/each}
    <span class="spacer"></span>
    {#if view === "experiment"}
      <button
        class:active={fromSelected}
        data-testid="run-from-step"
        disabled={!project.selection}
        title={project.selection
          ? "Run only the selected step, with the blocks it sits in"
          : "Select a step to run just that one"}
        onclick={() => (fromSelected = !fromSelected)}>from step</button
      >
      <button data-testid="restart" onclick={() => (runToken += 1)}>restart</button>
    {/if}
    <button
      data-testid="download-html"
      disabled={!html}
      onclick={() => download(`${project.spec.name}.html`, html, "text/html")}>.html</button
    >
    <button
      data-testid="download-spec"
      onclick={() => download(`${project.spec.name}.json`, specJson, "application/json")}
      >.json</button
    >
  </nav>

  {#if error}
    {@const problems = currentProblems()}
    {@const overall = overallProblems(problems)}
    <div class="error" data-testid="compile-error">
      {#each overall as problem (problem.message)}
        <p>{problem.message}</p>
      {/each}
      {#if problems.length > overall.length}
        <p data-testid="steps-need-attention">
          {problems.length - overall.length} step{problems.length - overall.length === 1 ? "" : "s"}
          need attention; each one says what it needs.
        </p>
      {/if}
    </div>
  {/if}

  {#if view === "experiment"}
    <p class="note" data-testid="preview-note">
      {runningFrom ? "Running the selected step only." : "Running the whole experiment."} Data is not
      saved from a preview.
    </p>
    {#if html}
      {#key `${html}-${runToken}`}
        <iframe
          title="experiment preview"
          data-testid="preview"
          sandbox="allow-scripts allow-modals"
          srcdoc={html}
        ></iframe>
      {/key}
    {:else}
      <p class="placeholder">Nothing to run yet.</p>
    {/if}
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
  nav {
    display: flex;
    gap: 0.3rem;
    align-items: center;
    margin-bottom: 0.4rem;
  }
  .spacer {
    flex: 1;
  }
  nav button.active {
    border-color: var(--accent);
    color: var(--accent);
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
