// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { readStored, writeStored } from "../src/lib/storage.ts";

describe("remembered settings", () => {
  beforeEach(() => localStorage.clear());

  it("reads back what was written", () => {
    writeStored("theme", "dark");
    expect(readStored("theme")).toBe("dark");
    expect(localStorage.getItem("tachisto:theme")).toBe("dark");
  });

  it("has nothing for a setting never saved", () => {
    expect(readStored("theme")).toBeNull();
  });

  it("carries a setting saved before the rename over to the new name", () => {
    localStorage.setItem("jspsych-studio:theme", "light");
    expect(readStored("theme")).toBe("light");
    expect(localStorage.getItem("tachisto:theme")).toBe("light");
    expect(localStorage.getItem("jspsych-studio:theme")).toBeNull();
  });

  it("prefers a setting saved under the new name over an old one", () => {
    localStorage.setItem("jspsych-studio:theme", "light");
    writeStored("theme", "dark");
    expect(readStored("theme")).toBe("dark");
  });
});
