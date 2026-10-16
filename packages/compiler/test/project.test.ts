import { describe, expect, it } from "vitest";
import { projectFiles } from "../src/targets/project.ts";
import type { Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

// A one-pixel PNG, as the builder would hold it after someone added a file.
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const spec: Spec = {
  name: "picture-study",
  data: { save: "post", experiment_id: "abc123DEF456" },
  assets: [{ name: "face.png", url: PIXEL }],
  timeline: [
    {
      kind: "trial",
      plugin: "image-keyboard-response",
      params: { stimulus: "face.png" },
    },
  ],
};

describe("downloading the whole project", () => {
  it("includes the page, the experiment, the project file and a readme", async () => {
    const files = await projectFiles(spec, schemas);
    expect(Object.keys(files).sort()).toEqual([
      "README.md",
      "assets/face.png",
      "dataset_description.json",
      "experiment.js",
      "experiment.json",
      "index.html",
    ]);
  });

  it("writes media as real files rather than embedding them", async () => {
    const files = await projectFiles(spec, schemas);
    const picture = files["assets/face.png"] as Uint8Array;

    expect(picture).toBeInstanceOf(Uint8Array);
    // A PNG, byte for byte, rather than text that looks like one.
    expect([...picture.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(files["experiment.js"]).toContain('"face.png": "assets/face.png"');
    expect(files["experiment.js"]).not.toContain("base64");
  });

  it("keeps the experiment in its own file, loaded by the page", async () => {
    const files = await projectFiles(spec, schemas);
    expect(files["index.html"]).toContain('<script src="experiment.js">');
    expect(files["index.html"]).not.toContain("jsPsych.run");
    expect(files["experiment.js"]).toContain("jsPsych.run");
  });

  it("can be opened again in the builder", async () => {
    const files = await projectFiles(spec, schemas);
    const reopened = JSON.parse(files["experiment.json"] as string) as Spec;
    expect(reopened).toEqual(spec);
  });

  it("says where the data goes", async () => {
    const uploading = await projectFiles(spec, schemas);
    expect(uploading["README.md"]).toContain("abc123DEF456");

    const nowhere = await projectFiles({ ...spec, data: undefined }, schemas);
    expect(nowhere["README.md"]).toContain("does not keep its results");
  });

  it("describes the data it will produce, in Psych-DS form", async () => {
    const files = await projectFiles(spec, schemas, { generatedAt: "2026-10-16" });
    const metadata = JSON.parse(files["dataset_description.json"] as string);

    expect(metadata["@context"]).toBe("https://schema.org/");
    expect(metadata["@type"]).toBe("Dataset");
    expect(metadata.name).toBe("picture-study");
    expect(metadata.dateCreated).toBe("2026-10-16");
    // The tools are what the data is based on; they are not authors. jsPsych is named in its own
    // right, with its version, because it is what wrote the rows.
    expect(metadata.isBasedOn).toMatchObject([
      { "@type": "SoftwareApplication", name: "jsPsych Studio" },
      { "@type": "SoftwareApplication", name: "jsPsych", softwareVersion: expect.any(String) },
    ]);
    expect(metadata.producer).toBeUndefined();
    expect(metadata.author).toBeUndefined();

    // The columns this experiment actually writes, not a generic list.
    expect(metadata.variableMeasured).toContain("participant_id");
    expect(metadata.variableMeasured).toContain("rt");
    expect(metadata.variableMeasured).toContain("trial_type");
  });

  it("says in the experiment file where it came from and how to keep editing", async () => {
    const files = await projectFiles(spec, schemas, { generatedAt: "2026-10-16" });
    const source = files["experiment.js"] as string;

    expect(source.startsWith("/*")).toBe(true);
    expect(source).toContain("Built with jsPsych Studio on 2026-10-16");
    expect(source).toContain("generated from experiment.json");
    expect(files["index.html"]).toContain('<meta name="generator" content="jsPsych Studio" />');
  });

  it("leaves the Studio version out until there is a release", async () => {
    const files = await projectFiles(spec, schemas);
    const metadata = JSON.parse(files["dataset_description.json"] as string);

    // Every workspace sits at 0.0.0 before the first release, and a dataset built by
    // "jsPsych Studio 0.0.0" names a build nobody can obtain. jsPsych still has a real one.
    expect(metadata.isBasedOn[0].softwareVersion).toBeUndefined();
    expect(metadata.isBasedOn[1].softwareVersion).toEqual(expect.any(String));
    expect(files["experiment.js"]).toContain("Built with jsPsych Studio on");
  });

  it("says which Studio built it, once there is a version", async () => {
    const files = await projectFiles(spec, schemas, {
      generatedAt: "2026-10-16",
      studio: "1.2.0",
    });
    const metadata = JSON.parse(files["dataset_description.json"] as string);

    expect(metadata.isBasedOn[0]).toMatchObject({
      name: "jsPsych Studio",
      softwareVersion: "1.2.0",
    });
    expect(files["experiment.js"]).toContain("Built with jsPsych Studio 1.2.0 on 2026-10-16");
    expect(files["index.html"]).toContain(
      '<meta name="generator" content="jsPsych Studio 1.2.0" />',
    );
    expect(files["README.md"]).toContain("Built with jsPsych Studio 1.2.0.");
  });

  it("names the experiment on every row of the data", async () => {
    const files = await projectFiles(spec, schemas);
    expect(files["experiment.js"]).toContain('experiment: "picture-study"');
  });

  it("names the people who made it, when they have said who they are", async () => {
    const withAuthors = {
      ...spec,
      authors: [
        { name: "A Researcher", identifier: "https://orcid.org/0000-0002-1825-0097" },
        { name: "Another Researcher" },
      ],
    };
    const files = await projectFiles(withAuthors, schemas);
    const metadata = JSON.parse(files["dataset_description.json"] as string);

    expect(metadata.author).toEqual([
      {
        "@type": "Person",
        name: "A Researcher",
        identifier: "https://orcid.org/0000-0002-1825-0097",
      },
      { "@type": "Person", name: "Another Researcher" },
    ]);
  });
});
