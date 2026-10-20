// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const freshDownloads = async () => {
  vi.resetModules();
  return import("../src/lib/downloads.svelte.ts");
};

describe("self-contained downloads", () => {
  beforeEach(() => localStorage.clear());

  it("are on until someone turns them off", async () => {
    const { downloads } = await freshDownloads();
    expect(downloads.selfContained).toBe(true);
  });

  it("stay off once turned off, the next time the builder opens", async () => {
    const first = await freshDownloads();
    first.setSelfContained(false);
    expect(first.downloads.selfContained).toBe(false);
    const { downloads } = await freshDownloads();
    expect(downloads.selfContained).toBe(false);
  });

  it("are still offered when the browser will not remember settings", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { downloads, setSelfContained } = await freshDownloads();
    expect(downloads.selfContained).toBe(true);
    expect(() => setSelfContained(false)).not.toThrow();
    expect(downloads.selfContained).toBe(false);
    vi.restoreAllMocks();
  });
});
