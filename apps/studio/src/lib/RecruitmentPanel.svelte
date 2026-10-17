<script lang="ts">
  import { idParamOf } from "@jspsych-studio/compiler";
  import { project } from "./project.svelte.ts";
  import {
    addEnding,
    choosePlatform,
    earlyEndings,
    endingKind,
    guideFor,
    platformChoice,
    PLATFORMS,
    removeEnding,
    setCompletionUrl,
    setEndingKind,
    setEndingTarget,
    setIdParam,
    type EndingKind,
    type PlatformChoice,
  } from "./recruitment.ts";

  const recruitment = $derived(project.spec.recruitment);
  const platform = $derived(platformChoice(project.spec));
  const guide = $derived(platform === "none" ? undefined : guideFor(platform));
  const endings = $derived(earlyEndings(project.spec));

  let newEnding = $state("");
  let endingProblem = $state<string | undefined>();
</script>

<section>
  <h2>Recruitment</h2>
  <select
    data-testid="recruitment-platform"
    value={platform}
    onchange={(e) => choosePlatform(project.spec, e.currentTarget.value as PlatformChoice)}
  >
    <option value="none">participants open the link directly</option>
    {#each PLATFORMS as option (option.id)}
      <option value={option.id}>{option.label}</option>
    {/each}
  </select>

  {#if platform !== "none"}
    <label for="recruitment-id-param">Participant id arrives as</label>
    <input
      id="recruitment-id-param"
      data-testid="recruitment-id-param"
      placeholder={idParamOf(recruitment)}
      value={recruitment?.id_param ?? ""}
      onchange={(e) => setIdParam(project.spec, e.currentTarget.value)}
    />
    <label for="recruitment-complete">When the data is saved, send them to</label>
    <input
      id="recruitment-complete"
      data-testid="recruitment-complete"
      type="url"
      placeholder={guide?.urlPlaceholder}
      value={recruitment?.endings?.complete?.url ?? ""}
      onchange={(e) => setCompletionUrl(project.spec, e.currentTarget.value)}
    />
    {#if guide}
      <p class="muted" data-testid="recruitment-hint">{guide.hint}</p>
    {/if}
    <p class="muted">The preview never saves data, so it never sends anyone away.</p>
  {/if}

  <h3>Ending early</h3>
  <p class="muted">
    An end step in the timeline finishes the study here, after saving the data, for example when
    someone declines consent.
  </p>
  {#each endings as { name, ending } (name)}
    <div class="ending" data-testid={`ending-${name}`}>
      <span class="ending-name">
        {name}
        <button
          title="remove this ending"
          data-testid={`remove-ending-${name}`}
          onclick={() => removeEnding(project.spec, name)}>✕</button
        >
      </span>
      {#if platform !== "none"}
        <select
          aria-label={`what the ${name} ending does`}
          data-testid={`ending-kind-${name}`}
          value={endingKind(ending)}
          onchange={(e) => setEndingKind(project.spec, name, e.currentTarget.value as EndingKind)}
        >
          <option value="message">show a message</option>
          <option value="url">send them back to the platform</option>
        </select>
      {/if}
      {#if endingKind(ending) === "url"}
        <input
          aria-label={`where the ${name} ending sends them`}
          data-testid={`ending-url-${name}`}
          type="url"
          placeholder={guide?.urlPlaceholder}
          value={ending.url}
          onchange={(e) => setEndingTarget(project.spec, name, e.currentTarget.value)}
        />
      {:else}
        <textarea
          aria-label={`the ${name} ending's message`}
          data-testid={`ending-message-${name}`}
          rows="2"
          value={ending.message}
          onchange={(e) => setEndingTarget(project.spec, name, e.currentTarget.value)}></textarea>
      {/if}
    </div>
  {/each}
  <form
    class="add-ending"
    onsubmit={(e) => {
      e.preventDefault();
      endingProblem = addEnding(project.spec, newEnding);
      if (!endingProblem) newEnding = "";
    }}
  >
    <input
      aria-label="name of a new ending"
      aria-describedby={endingProblem ? "new-ending-problem" : undefined}
      data-testid="new-ending-name"
      placeholder="e.g. no_consent"
      bind:value={newEnding}
    />
    <button data-testid="add-ending" type="submit">add an ending</button>
  </form>
  {#if endingProblem}
    <p class="warn" id="new-ending-problem" data-testid="new-ending-problem">{endingProblem}</p>
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
  h3 {
    margin: 0.6rem 0 0;
    font-size: 0.9rem;
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
  .ending {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.4rem 0;
    border-top: 1px solid var(--rule);
  }
  .ending-name {
    display: flex;
    justify-content: space-between;
    font-weight: 600;
  }
  .ending-name button {
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .warn {
    margin: 0;
    font-size: 0.8rem;
    color: var(--accent);
  }
  .add-ending {
    display: flex;
    gap: 0.3rem;
  }
  .add-ending input {
    flex: 1;
  }
</style>
