import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import type { Spec, TrialNode } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const image = { name: "a.png", url: "data:image/png;base64,AA==" };

const study = (plugin: string, params: Record<string, unknown>): Spec => ({
  name: "rules",
  assets: [image],
  timeline: [{ kind: "trial", plugin, params: params as TrialNode["params"] }],
});

const compiles = (spec: Spec) => () => compileSpec(spec, schemas);

describe("visual search", () => {
  const search = (params: Record<string, unknown>) =>
    study("visual-search-circle", { target_present: true, fixation_image: "a.png", ...params });

  it("takes a target, a foil and a set size", () => {
    expect(compiles(search({ target: "a.png", foil: "a.png", set_size: 4 }))).not.toThrow();
  });

  it("takes a list of images instead", () => {
    expect(compiles(search({ stimuli: ["a.png", "a.png"] }))).not.toThrow();
  });

  it("counts a set size read from a column as given", () => {
    const spec = search({ target: "a.png", foil: "a.png", set_size: { var: "size" } });
    spec.conditions = { sizes: [{ size: 4 }] };
    spec.timeline = [{ kind: "block", conditions: "sizes", children: spec.timeline }];
    expect(compiles(spec)).not.toThrow();
  });

  it("rejects neither", () => {
    expect(compiles(search({}))).toThrow(
      /needs either a target, a foil and a set size, or a list of images/,
    );
  });

  it("rejects half of the first", () => {
    expect(compiles(search({ target: "a.png", foil: "a.png" }))).toThrow(
      /needs a target, a foil and a set size together/,
    );
  });

  it("rejects both", () => {
    expect(
      compiles(search({ target: "a.png", foil: "a.png", set_size: 4, stimuli: ["a.png"] })),
    ).toThrow(/not both/);
  });

  it("rejects one key for both present and absent", () => {
    expect(
      compiles(search({ target: "a.png", foil: "a.png", set_size: 4, target_absent_key: "J" })),
    ).toThrow(/uses "j" for both target_present_key and target_absent_key/);
  });
});

describe("cloze", () => {
  const cloze = (text: unknown) => study("cloze", { text });

  it.each(["<p>The %cat% sat on the %mat%.</p>", "<p>%cat%</p>"])("takes %j", (text) => {
    expect(compiles(cloze(text))).not.toThrow();
  });

  it.each(["<p>No gaps here.</p>", "<p>50% of %cats%</p>"])("rejects %j", (text) => {
    expect(compiles(cloze(text))).toThrow(/needs each gap written between two percent signs/);
  });

  it("leaves text read from a column to be checked when it runs", () => {
    const spec = cloze({ var: "sentence" });
    spec.conditions = { sentences: [{ sentence: "no gaps" }] };
    spec.timeline = [{ kind: "block", conditions: "sentences", children: spec.timeline }];
    expect(compiles(spec)).not.toThrow();
  });
});

describe("the implicit association test", () => {
  const iat = (params: Record<string, unknown>) =>
    study("iat-html", { stimulus: "<p>tulip</p>", stim_key_association: "left", ...params });

  it("rejects one key for both sides", () => {
    expect(compiles(iat({ right_category_key: "e" }))).toThrow(
      /uses "e" for both left_category_key and right_category_key/,
    );
  });

  it.each([[[]], [["a", "b", "c"]]])("rejects a side named by %j", (labels) => {
    expect(compiles(iat({ left_category_label: labels }))).toThrow(
      /parameter "left_category_label" takes 1 to 2 entries/,
    );
  });
});

describe("most and least", () => {
  it("rejects a single option", () => {
    expect(
      compiles(study("maxdiff", { alternatives: ["only"], labels: ["least", "most"] })),
    ).toThrow(/parameter "alternatives" takes at least 2 entries/);
  });
});

describe("drawing", () => {
  it("rejects a canvas shape the plugin cannot draw", () => {
    expect(compiles(study("sketchpad", { canvas_shape: "triangle" }))).toThrow(
      /parameter "canvas_shape" expects one of "rectangle", "circle"/,
    );
  });
});

describe("a page from the study's website", () => {
  it("rejects a page with no way to continue", () => {
    expect(compiles(study("external-html", { url: "consent.html" }))).toThrow(
      /needs a key or a button on the page to continue with/,
    );
  });

  it.each([{ cont_btn: "agree" }, { cont_key: "Enter" }])("takes %j to continue", (way) => {
    expect(compiles(study("external-html", { url: "consent.html", ...way }))).not.toThrow();
  });
});

describe("the browser check", () => {
  it("rejects a feature it does not measure", () => {
    expect(compiles(study("browser-check", { features: ["width", "gps"] }))).toThrow(
      /parameter "features" expects each entry to be one of/,
    );
  });
});

describe("your own form", () => {
  it("requires the form", () => {
    expect(compiles(study("survey-html-form", {}))).toThrow(/requires parameter "html"/);
  });
});

describe("measuring viewing distance", () => {
  it("compiles with every setting left to the plugin", () => {
    expect(compiles(study("virtual-chinrest", {}))).not.toThrow();
  });
});
