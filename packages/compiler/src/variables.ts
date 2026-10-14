import type { ParameterValue, Spec, VariableReference } from "./types.ts";

export function isVariableReference(value: ParameterValue): value is VariableReference {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "var" in value;
}

export function conditionColumns(spec: Spec, table: string) {
  const rows = spec.conditions?.[table] ?? [];
  return [...new Set(rows.flatMap((row) => Object.keys(row)))];
}
