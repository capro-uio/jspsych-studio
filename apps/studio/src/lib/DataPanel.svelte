<script lang="ts">
  import { DATAPIPE_URL, usesRecordings } from "@jspsych-studio/compiler";
  import { project } from "./project.svelte.ts";

  const mode = $derived(project.spec.data?.save ?? "none");
  const records = $derived(usesRecordings(project.spec));

  function setMode(value: string) {
    if (value === "none") delete project.spec.data;
    else if (value === "download") project.spec.data = { save: "download" };
    else project.spec.data = { save: "post", experiment_id: "" };
  }

  function setField(field: "experiment_id" | "endpoint", value: string) {
    if (!project.spec.data) return;
    if (value) project.spec.data[field] = value;
    else delete project.spec.data[field];
  }
</script>

<section>
  <h2>Data</h2>
  <select data-testid="data-mode" value={mode} onchange={(e) => setMode(e.currentTarget.value)}>
    <option value="none">not saved anywhere</option>
    <option value="download">download a CSV to the participant's computer</option>
    <option value="post">upload to DataPipe or another service</option>
  </select>

  {#if mode === "none"}
    <p class="warn" data-testid="data-warning">
      This experiment keeps no results. Choose where data should go before you recruit anyone.
    </p>
  {/if}

  {#if mode === "post"}
    <label for="data-experiment-id">Experiment ID</label>
    <input
      id="data-experiment-id"
      data-testid="data-experiment-id"
      placeholder="from your DataPipe dashboard"
      value={project.spec.data?.experiment_id ?? ""}
      onchange={(e) => setField("experiment_id", e.currentTarget.value)}
    />
    <label for="data-endpoint">Service</label>
    <input
      id="data-endpoint"
      data-testid="data-endpoint"
      placeholder={DATAPIPE_URL}
      value={project.spec.data?.endpoint ?? ""}
      onchange={(e) => setField("endpoint", e.currentTarget.value)}
    />
    <p class="muted">
      If the upload fails, the participant is asked to download the file and send it to you, so
      nothing is lost.
    </p>
    {#if records}
      <p class="muted" data-testid="data-recordings">
        Each recording is uploaded as a sound or video file of its own, and the data names it. Turn
        on base64 data for this experiment in DataPipe, or those uploads fail and the recordings
        stay inside the downloaded file instead.
      </p>
    {/if}
  {:else if mode === "download" && records}
    <p class="muted" data-testid="data-recordings">
      Each recording is downloaded as a sound or video file of its own, and the data names it.
    </p>
  {/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
  }
  label {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .muted,
  .warn {
    margin: 0;
    font-size: 0.8rem;
  }
  .muted {
    color: var(--muted);
  }
  .warn {
    color: var(--accent);
  }
</style>
