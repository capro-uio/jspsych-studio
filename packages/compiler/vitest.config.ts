import { defineConfig } from "vitest/config";

// The end-to-end suites each launch a browser and a server, which is more than enough work to
// have in flight at once.
export default defineConfig({
  test: { fileParallelism: false, testTimeout: 180_000 },
});
