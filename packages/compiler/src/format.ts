// prettier/standalone keeps formatting usable inside the builder's browser preview (the default
// entry point reaches for node:fs), and importing it lazily keeps it out of the main bundle.
export async function formatSource(source: string) {
  const [{ format }, babel, estree] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/babel"),
    import("prettier/plugins/estree"),
  ]);
  return format(source, {
    parser: "babel",
    plugins: [babel.default ?? babel, estree.default ?? estree],
    printWidth: 100,
  });
}
