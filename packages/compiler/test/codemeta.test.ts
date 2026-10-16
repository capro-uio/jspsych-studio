import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import bundle from "@jspsych-studio/schemas/plugin-schemas.json" with { type: "json" };
import manifest from "../package.json" with { type: "json" };
import { updateCodemeta } from "../src/codemeta.ts";

const handWritten = {
  "@context": "https://w3id.org/codemeta/3.0",
  name: "jsPsych Studio",
  author: [{ "@type": "Person", familyName: "Mowinckel" }],
};

const facts = { version: "0.0.2", jspsych: "8.3.0", date: "2026-11-01" };

describe("codemeta for a release", () => {
  it("records the version, where to get it, and the jsPsych it builds for", () => {
    const updated = updateCodemeta(handWritten, facts);
    expect(updated).toMatchObject({
      version: "0.0.2",
      dateModified: "2026-11-01",
      downloadUrl: "https://github.com/capro-uio/jspsych-studio/releases/tag/v0.0.2",
      softwareRequirements: [{ name: "jsPsych", version: "8.3.0" }],
    });
  });

  it("keeps what was written by hand, in place", () => {
    const updated = updateCodemeta(handWritten, facts);
    expect(Object.keys(updated).slice(0, 3)).toEqual(["@context", "name", "author"]);
    expect(updated.author).toEqual(handWritten.author);
  });

  // The date would otherwise change every day, and the check that codemeta.json is current with it.
  it("moves the date only when the version changes", () => {
    const released = updateCodemeta(handWritten, facts);
    expect(updateCodemeta(released, { ...facts, date: "2027-01-01" }).dateModified).toBe(
      "2026-11-01",
    );
    expect(
      updateCodemeta(released, { ...facts, version: "0.0.3", date: "2027-01-01" }).dateModified,
    ).toBe("2027-01-01");
  });

  it("is current with this build in the committed file", () => {
    const committed = JSON.parse(
      readFileSync(new URL("../../../codemeta.json", import.meta.url), "utf8"),
    );
    expect(committed.version).toBe(manifest.version);
    expect(committed.softwareRequirements[0].version).toBe(bundle.jspsych);
  });
});
