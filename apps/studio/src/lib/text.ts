/** A value as an input shows it: objects and lists as JSON, so they never read "[object Object]". */
export function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return "";
}
