<script lang="ts">
  import { idParamOf } from "@jspsych-studio/compiler";
  import type { RecruitmentPlatform } from "@jspsych-studio/compiler";
  import { project } from "./project.svelte.ts";
  import {
    choosePlatform,
    guideFor,
    PLATFORMS,
    setCompletionUrl,
    setIdParam,
  } from "./recruitment.ts";

  const recruitment = $derived(project.spec.recruitment);
  const guide = $derived(guideFor(recruitment?.platform));
</script>

<section>
  <h2>Recruitment</h2>
  <select
    data-testid="recruitment-platform"
    value={recruitment ? (recruitment.platform ?? "custom") : "none"}
    onchange={(e) =>
      choosePlatform(project.spec, e.currentTarget.value as RecruitmentPlatform | "none")}
  >
    <option value="none">participants open the link directly</option>
    {#each PLATFORMS as option (option.id)}
      <option value={option.id}>{option.label}</option>
    {/each}
  </select>

  {#if recruitment}
    <label for="recruitment-id-param">Participant id arrives as</label>
    <input
      id="recruitment-id-param"
      data-testid="recruitment-id-param"
      placeholder={idParamOf(recruitment)}
      value={recruitment.id_param ?? ""}
      onchange={(e) => setIdParam(project.spec, e.currentTarget.value)}
    />
    <label for="recruitment-complete">When the data is saved, send them to</label>
    <input
      id="recruitment-complete"
      data-testid="recruitment-complete"
      type="url"
      placeholder={guide?.urlPlaceholder}
      value={recruitment.endings?.complete?.url ?? ""}
      onchange={(e) => setCompletionUrl(project.spec, e.currentTarget.value)}
    />
    {#if guide}
      <p class="muted" data-testid="recruitment-hint">{guide.hint}</p>
    {/if}
    <p class="muted">The preview never saves data, so it never sends anyone away.</p>
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
  .muted {
    margin: 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
</style>
