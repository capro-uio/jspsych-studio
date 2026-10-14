<script lang="ts">
  import type { ParameterSchema } from "@jspsych-studio/schemas";
  import { isVariableReference } from "@jspsych-studio/compiler";
  import type { ParameterValue } from "@jspsych-studio/compiler";

  interface Props {
    assets: string[];
    name: string;
    parameter: ParameterSchema;
    required: boolean;
    columns: string[];
    value: ParameterValue | undefined;
    onchange: (value: ParameterValue | undefined) => void;
  }

  const { assets, name, parameter, required, columns, value, onchange }: Props = $props();

  const MEDIA_TYPES = new Set(["IMAGE", "AUDIO", "VIDEO"]);
  const media = $derived(MEDIA_TYPES.has(parameter.jspsychType));

  const isBound = $derived(value !== undefined && isVariableReference(value));
  const boundValue = $derived(isBound ? (value as { var: string; wrap?: string }) : null);
  const multiline = $derived(parameter.jspsychType === "HTML_STRING");

  const numeric = $derived(parameter.jspsychType === "INT" || parameter.jspsychType === "FLOAT");

  function fixedSeed(): ParameterValue {
    if (parameter.jspsychType === "BOOL") return Boolean(parameter.default);
    if (numeric) return typeof parameter.default === "number" ? parameter.default : 0;
    if (parameter.enum) return parameter.enum[0] as string;
    return typeof parameter.default === "string" ? parameter.default : "";
  }

  function setMode(mode: string) {
    if (mode === "column") onchange({ var: columns[0] ?? "" });
    else if (mode === "unset") onchange(undefined);
    else onchange(fixedSeed());
  }

  function parseKeys(raw: string): ParameterValue {
    const trimmed = raw.trim();
    if (trimmed === "ALL_KEYS" || trimmed === "NO_KEYS") return trimmed;
    return trimmed
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
  }

  const keysAsText = $derived(Array.isArray(value) ? value.join(",") : String(value ?? ""));
  const mode = $derived(value === undefined ? "unset" : isBound ? "column" : "fixed");
</script>

<div class="field">
  <label for={`param-${name}`}>
    <span class="name">{name}</span>
    {#if required}<span class="required" title="required">*</span>{/if}
  </label>

  <select
    aria-label={`${name} source`}
    data-testid={`mode-${name}`}
    value={mode}
    onchange={(event) => setMode(event.currentTarget.value)}
  >
    <option value="unset">default</option>
    <option value="fixed">fixed value</option>
    <option value="column" disabled={columns.length === 0}>from column</option>
  </select>

  {#if mode === "column" && boundValue}
    <select
      data-testid={`column-${name}`}
      value={boundValue.var}
      onchange={(event) => onchange({ ...boundValue, var: event.currentTarget.value })}
    >
      {#each columns as column (column)}
        <option value={column}>{column}</option>
      {/each}
    </select>
    {#if multiline}
      <input
        data-testid={`wrap-${name}`}
        placeholder={"wrap in HTML, {} is the value"}
        value={boundValue.wrap ?? ""}
        onchange={(event) =>
          onchange(
            event.currentTarget.value
              ? { ...boundValue, wrap: event.currentTarget.value }
              : { var: boundValue.var },
          )}
      />
    {/if}
  {:else if mode === "fixed"}
    {#if parameter.jspsychType === "BOOL"}
      <input
        id={`param-${name}`}
        data-testid={`value-${name}`}
        type="checkbox"
        checked={Boolean(value)}
        onchange={(event) => onchange(event.currentTarget.checked)}
      />
    {:else if parameter.jspsychType === "INT" || parameter.jspsychType === "FLOAT"}
      <input
        id={`param-${name}`}
        data-testid={`value-${name}`}
        type="number"
        value={value as number}
        onchange={(event) =>
          onchange(
            Number.isNaN(event.currentTarget.valueAsNumber) ? 0 : event.currentTarget.valueAsNumber,
          )}
      />
    {:else if media && assets.length > 0}
      <select
        id={`param-${name}`}
        data-testid={`value-${name}`}
        value={value as string}
        onchange={(event) => onchange(event.currentTarget.value)}
      >
        <option value="">choose a file</option>
        {#each assets as file (file)}
          <option value={file}>{file}</option>
        {/each}
      </select>
    {:else if parameter.enum}
      <select
        id={`param-${name}`}
        data-testid={`value-${name}`}
        value={value as string}
        onchange={(event) => onchange(event.currentTarget.value)}
      >
        {#each parameter.enum as option (option)}
          <option value={option as string}>{option as string}</option>
        {/each}
      </select>
    {:else if parameter.jspsychType === "KEYS"}
      <input
        id={`param-${name}`}
        data-testid={`value-${name}`}
        value={keysAsText}
        placeholder="f,j or ALL_KEYS"
        onchange={(event) => onchange(parseKeys(event.currentTarget.value))}
      />
    {:else if multiline}
      <textarea
        id={`param-${name}`}
        data-testid={`value-${name}`}
        rows="2"
        value={value as string}
        onchange={(event) => onchange(event.currentTarget.value)}></textarea>
    {:else}
      <input
        id={`param-${name}`}
        data-testid={`value-${name}`}
        value={value as string}
        onchange={(event) => onchange(event.currentTarget.value)}
      />
    {/if}
  {/if}

  {#if parameter.description}
    <p class="help" title={parameter.description}>{parameter.description}</p>
  {/if}
</div>

<style>
  .field {
    display: grid;
    grid-template-columns: 11rem 9rem 1fr;
    gap: 0.4rem 0.6rem;
    align-items: start;
    padding: 0.4rem 0;
    border-top: 1px solid var(--rule);
  }
  label {
    font-weight: 600;
  }
  .required {
    color: var(--accent);
  }
  .help {
    grid-column: 3;
    margin: 0;
    font-size: 0.78rem;
    color: var(--muted);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
