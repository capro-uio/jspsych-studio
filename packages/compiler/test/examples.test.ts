import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import type { Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const examplesDirectory = fileURLToPath(new URL("../../../examples/", import.meta.url));
const files = readdirSync(examplesDirectory).filter((name) => name.endsWith(".json"));

describe("the bundled examples", () => {
  it("ships more than one", () => {
    expect(files.length).toBeGreaterThan(1);
  });

  // Examples are the first thing anyone opens, so one that no longer compiles is a broken
  // first impression rather than a stale fixture.
  it.each(files)("%s compiles", (file) => {
    const spec = JSON.parse(readFileSync(join(examplesDirectory, file), "utf8")) as Spec;
    expect(() => compileSpec(spec, schemas)).not.toThrow();
  });
});
