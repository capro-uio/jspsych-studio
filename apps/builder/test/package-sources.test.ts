import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { cdnUrl, type PackageFile } from "@tachisto/compiler";
import { asText, fetchPackageSources, integrityOf } from "../src/lib/package-sources.ts";
import { schemas } from "../src/lib/schemas.ts";
import { installedCopy } from "./installed.ts";

const respond = (body: Uint8Array<ArrayBuffer> | null, status = 200) =>
  Promise.resolve(new Response(body, { status }));

const jspsychFile = (path: string): PackageFile => ({
  package: "jspsych",
  version: schemas.jspsych,
  path,
  integrity: schemas.packages.jspsych.files[path],
});

describe("integrityOf", () => {
  it("hashes a file the way the recorded hashes were made", async () => {
    const bytes = new TextEncoder().encode("abc");
    const expected = `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
    expect(await integrityOf(bytes)).toBe(expected);
  });
});

describe("fetchPackageSources", () => {
  const css = jspsychFile("css/jspsych.css");

  it("fetches each file from unpkg at its version and keeps the copy that matches", async () => {
    const fetcher = vi.fn((url: string) => respond(installedCopy(url)));
    const copies = await fetchPackageSources([css], fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledWith(cdnUrl(css));
    expect(asText(copies)["jspsych/css/jspsych.css"]).toContain(".jspsych-display-element");
  });

  it("refuses a copy that is not the file Tachisto checked", async () => {
    const fetcher = () => respond(new TextEncoder().encode("body { display: none }"));
    await expect(fetchPackageSources([css], fetcher as unknown as typeof fetch)).rejects.toThrow(
      /jspsych\/css\/jspsych\.css from unpkg is not the file Tachisto checked/,
    );
  });

  it("says which file it could not fetch", async () => {
    const fetcher = () => respond(null, 404);
    await expect(fetchPackageSources([css], fetcher as unknown as typeof fetch)).rejects.toThrow(
      /could not fetch jspsych\/css\/jspsych\.css \(404\)/,
    );
  });
});
