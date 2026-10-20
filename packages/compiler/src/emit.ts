// A `</script>` inside any user string would close the inline script tag that carries the
// experiment, so every emitted literal escapes `<` (and the line separators JS treats as breaks).
export function literal(value: unknown) {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Escapes text for HTML, inside an element or a double-quoted attribute such as a description. */
export function escapeHtmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
