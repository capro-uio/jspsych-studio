<script lang="ts">
  import type { ParameterSchema } from "@jspsych-studio/schemas";
  import ListField from "./ListField.svelte";
  import ScalarInput from "./ScalarInput.svelte";

  interface Props {
    schema: ParameterSchema;
    assets: string[];
    value: Record<string, unknown>;
    testId: string;
    onchange: (value: Record<string, unknown>) => void;
  }

  const { schema, assets, value, testId, onchange }: Props = $props();

  const fields = $derived(Object.entries(schema.properties ?? {}));
  const isRequired = (name: string) => (schema.required ?? []).includes(name);

  function update(name: string, next: unknown) {
    const merged = { ...value };
    if (next === "" && !isRequired(name)) delete merged[name];
    else merged[name] = next;
    onchange(merged);
  }
</script>

<div class="object">
  {#each fields as [name, field] (name)}
    <label for={`${testId}-${name}`}>
      {name}{#if isRequired(name)}<span class="required">*</span>{/if}
    </label>
    <div class="control">
      {#if field.type === "array" && field.jspsychType !== "KEYS"}
        <ListField
          testId={`${testId}-${name}`}
          parameter={field}
          {assets}
          values={Array.isArray(value[name]) ? (value[name] as unknown[]) : []}
          onchange={(entries) => update(name, entries)}
        />
      {:else}
        <ScalarInput
          parameter={field}
          {assets}
          value={value[name]}
          testId={`${testId}-${name}`}
          onchange={(next) => update(name, next)}
        />
      {/if}
    </div>
  {/each}
</div>

<style>
  .object {
    display: grid;
    grid-template-columns: 7rem 1fr;
    gap: 0.3rem 0.5rem;
    align-items: start;
    flex: 1;
    padding: 0.4rem;
    border: 1px solid var(--rule);
    border-radius: 4px;
  }
  label {
    font-size: 0.8rem;
    color: var(--muted);
    padding-top: 0.3rem;
  }
  .required {
    color: var(--accent);
  }
</style>
