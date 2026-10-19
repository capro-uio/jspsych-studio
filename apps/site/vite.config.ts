// vitest's defineConfig, because the `test` block is not part of vite's own config type.
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  server: { port: 5181 },
  test: {
    coverage: {
      provider: "v8",
      include: ["scripts/**/*.ts"],
      reporter: ["text-summary", "lcov"],
    },
  },
});
