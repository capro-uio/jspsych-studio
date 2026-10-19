/** The items in their first-seen order, each once. */
export function unique<T>(items: Iterable<T>): T[] {
  return [...new Set(items)];
}
