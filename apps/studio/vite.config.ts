import { svelte } from "@sveltejs/vite-plugin-svelte";
// vitest's defineConfig, because the `test` block is not part of vite's own config type.
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [svelte()],
  base: "./",
  server: { port: 5180 },
  test: { fileParallelism: false, testTimeout: 180_000 },
});
