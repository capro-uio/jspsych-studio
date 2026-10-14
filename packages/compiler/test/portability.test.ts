import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));
const BROWSER_SAFE_EXCEPTIONS = new Set(["cli.ts"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("compiler portability", () => {
  // The builder compiles and previews experiments in the browser, so everything except the CLI
  // has to run there too. A stray node: import would only surface when the GUI is bundled.
  it("imports no node builtins outside the CLI", () => {
    const offenders = sourceFiles(sourceRoot)
      .filter((path) => !BROWSER_SAFE_EXCEPTIONS.has(path.slice(sourceRoot.length + 1)))
      .filter((path) => /^\s*import[^\n]*["']node:/m.test(readFileSync(path, "utf8")));

    expect(offenders).toEqual([]);
  });
});
