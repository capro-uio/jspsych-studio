<script lang="ts">
  import { project } from "./project.svelte.ts";

  const authors = $derived(project.spec.authors ?? []);

  function update(index: number, field: "name" | "identifier", value: string) {
    const list = project.spec.authors;
    if (!list) return;
    if (value) list[index][field] = value;
    else if (field === "identifier") delete list[index].identifier;
    else list[index].name = "";
  }

  function add() {
    project.spec.authors = [...authors, { name: "" }];
  }

  function remove(index: number) {
    const remaining = authors.filter((_, position) => position !== index);
    if (remaining.length > 0) project.spec.authors = remaining;
    else delete project.spec.authors;
  }
</script>

<section>
  <h2>Who made this</h2>
  <p class="muted">
    Recorded alongside the data, so an experiment that outlives the person who built it still says
    who that was.
  </p>

  {#each authors as author, index (index)}
    <div class="author">
      <input
        data-testid={`author-name-${index}`}
        placeholder="name"
        value={author.name}
        onchange={(event) => update(index, "name", event.currentTarget.value)}
      />
      <input
        data-testid={`author-id-${index}`}
        placeholder="ORCID or other link (optional)"
        value={author.identifier ?? ""}
        onchange={(event) => update(index, "identifier", event.currentTarget.value)}
      />
      <button data-testid={`remove-author-${index}`} onclick={() => remove(index)}>✕</button>
    </div>
  {/each}

  <button class="add" data-testid="add-author" onclick={add}>
    {authors.length === 0 ? "+ add an author" : "+ another author"}
  </button>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
  }
  .author {
    display: flex;
    gap: 0.3rem;
  }
  .author input {
    flex: 1;
    min-width: 0;
  }
  .author button {
    border: 0;
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
  }
  .add {
    align-self: start;
    border: 0;
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0;
  }
  .muted {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
</style>
