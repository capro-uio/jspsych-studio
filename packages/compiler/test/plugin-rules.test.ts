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
  it.each([{}, { cont_key: "Enter" }])("rejects a page with no button to continue: %j", (way) => {
    expect(compiles(study("external-html", { url: "consent.html", ...way }))).toThrow(
      /needs the id of a button on the page to continue with/,
    );
  });

  it("takes a button on the page to continue", () => {
    expect(
      compiles(study("external-html", { url: "consent.html", cont_btn: "agree" })),
    ).not.toThrow();
  });

  it("rejects a button name that is not an element id", () => {
    expect(
      compiles(study("external-html", { url: "consent.html", cont_btn: "my button" })),
    ).toThrow(/names "my button" as its button, which is not an element id/);
  });

  it.each(["https://example.com/consent.html", "//example.com/consent.html", "data:text/html,hi"])(
    "rejects a page from elsewhere: %s",
    (url) => {
      expect(compiles(study("external-html", { url, cont_btn: "agree" }))).toThrow(
        /has to come from the study's own site/,
      );
    },
  );
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
  it("rejects sizes in degrees with no blind-spot measurement", () => {
    expect(compiles(study("virtual-chinrest", { resize_units: "deg", blindspot_reps: 0 }))).toThrow(
      /needs at least one blind-spot measurement/,
    );
  });

  it("compiles with every setting left to the plugin", () => {
    expect(compiles(study("virtual-chinrest", {}))).not.toThrow();
  });
});

describe("squares answered with a key", () => {
  const squares = (params: Record<string, unknown>) =>
    study("serial-reaction-time", { target: [0, 1], ...params });

  it("takes a target on a square of the default grid", () => {
    expect(compiles(squares({}))).not.toThrow();
  });

  it.each([
    [{ target: [0, 4] }, /lights square \[0, 4\], which is not a square of its grid/],
    [{ grid: [[1, 0]], choices: [["a", "b"]] }, /lights square \[0, 1\], which is not a square/],
    [
      {
        grid: [
          [1, 1],
          [1, 1],
        ],
      },
      /needs one key in its choices for each place in its grid/,
    ],
    [{ grid: [1, 1] }, /expects a grid: a list of rows/],
  ])("rejects %j", (params, message) => {
    expect(compiles(squares(params))).toThrow(message);
  });

  it.each([
    [{ choices: "ALL_KEYS" }, /parameter "choices" expects a grid/],
    [{ grid: [[1, 2, 1, 1]] }, /1 for a square or 0 for a gap/],
    [{ grid: [[true, true, true, true]] }, /1 for a square or 0 for a gap/],
    [{ grid: [[1, 1], []], choices: [["a", "b"], []] }, /each a list of at least one place/],
    [{ choices: [["3", "", "7", "9"]] }, /has no key for the square it lights, \[0, 1\]/],
    [{ choices: [["3", "5", "5", "9"]] }, /uses a key for more than one place/],
  ])("rejects %j", (params, message) => {
    expect(compiles(squares(params))).toThrow(message);
  });

  it("takes a grid of keys shaped like its squares", () => {
    expect(
      compiles(
        squares({
          grid: [
            [1, 1],
            [1, 1],
          ],
          choices: [
            ["q", "w"],
            ["a", "s"],
          ],
        }),
      ),
    ).not.toThrow();
  });
});

describe("squares answered by clicking", () => {
  it("needs no keys, only a target on a square", () => {
    expect(
      compiles(
        study("serial-reaction-time-mouse", {
          grid: [
            [1, 1],
            [1, 1],
          ],
          target: [1, 1],
        }),
      ),
    ).not.toThrow();
  });
});

describe("grids and targets read from a column", () => {
  const fromColumns = (params: Record<string, unknown>, rows: Record<string, unknown>[]): Spec => ({
    name: "rules",
    conditions: { trials: rows },
    timeline: [
      {
        kind: "block",
        conditions: "trials",
        children: [
          {
            kind: "trial",
            plugin: "serial-reaction-time-mouse",
            params: params as TrialNode["params"],
          },
        ],
      },
    ],
  });

  it("turns a target written as text into numbers when the trial starts", () => {
    const { source } = compileSpec(
      fromColumns({ target: { var: "target" } }, [{ target: "0,1" }]),
      schemas,
    );
    expect(source).toContain(
      'target: () => ((cell) => (Array.isArray(cell) ? cell : String(cell).split(",")).map(Number))(jsPsych.evaluateTimelineVariable("target"))',
    );
  });

  it("reads a grid written as text", () => {
    const spec = fromColumns({ grid: { var: "grid" }, target: [0, 0] }, [
      { grid: "[[1, 1], [1, 0]]" },
    ]);
    expect(compileSpec(spec, schemas).source).toContain("JSON.parse(cell)");
  });

  it.each([
    [
      { target: { var: "target" } },
      { target: "top left" },
      /which is not numbers separated by commas/,
    ],
    [
      { grid: { var: "grid" }, target: [0, 0] },
      { grid: "two by two" },
      /which is not a grid written as rows/,
    ],
  ])("rejects a cell that cannot be read: %j", (params, row, message) => {
    expect(compiles(fromColumns(params, [row]))).toThrow(message);
  });
});
