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

const warningsOf = (spec: Spec) =>
  compileSpec(spec, schemas).warnings.map((warning) => warning.message);

const STUCK = /has nothing to end it/;

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

  describe("when nothing ends it", () => {
    const shown = (params: Record<string, unknown>) =>
      search({ target: "a.png", foil: "a.png", set_size: 4, ...params });

    it("warns when a response does not end it and there is no time limit", () => {
      expect(warningsOf(shown({ response_ends_trial: false }))).toEqual([
        expect.stringMatching(STUCK),
      ]);
    });

    it("says nothing when a time limit ends it", () => {
      expect(warningsOf(shown({ response_ends_trial: false, trial_duration: 2000 }))).toEqual([]);
    });

    it("says nothing when a response ends it", () => {
      expect(warningsOf(shown({}))).toEqual([]);
    });
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

  it.each(["iat-html", "iat-image"])(
    "%s warns when a response does not end it and there is no time limit",
    (plugin) => {
      const stimulus = plugin === "iat-html" ? "<p>tulip</p>" : "a.png";
      const spec = study(plugin, {
        stimulus,
        stim_key_association: "left",
        response_ends_trial: false,
      });
      expect(warningsOf(spec)).toEqual([expect.stringMatching(STUCK)]);
    },
  );

  it("says nothing when a time limit ends it", () => {
    expect(warningsOf(iat({ response_ends_trial: false, trial_duration: 1500 }))).toEqual([]);
  });

  it("warns that a response ending the trial switches off its time limit", () => {
    expect(warningsOf(iat({ trial_duration: 1500 }))).toEqual([
      expect.stringMatching(/ignores its time limit \(trial_duration\) while a response ends/),
    ]);
  });

  it("says nothing when it waits for a response with no time limit, as by default", () => {
    expect(warningsOf(iat({}))).toEqual([]);
  });

  it("leaves a response_ends_trial read from a column to be known when it runs", () => {
    const spec = iat({ response_ends_trial: { var: "ends" } });
    spec.conditions = { rows: [{ ends: false }] };
    spec.timeline = [{ kind: "block", conditions: "rows", children: spec.timeline }];
    expect(warningsOf(spec)).toEqual([]);
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

  describe("when nothing ends it", () => {
    const unbuttoned = (params: Record<string, unknown>) =>
      study("sketchpad", { show_finished_button: false, ...params });

    it.each([{}, { choices: "NO_KEYS" }, { choices: [] }])(
      "warns with no finished button, no key and no time limit: %j",
      (keys) => {
        expect(warningsOf(unbuttoned(keys))).toEqual([expect.stringMatching(STUCK)]);
      },
    );

    it.each([{ choices: ["Enter"] }, { trial_duration: 30000 }])(
      "says nothing when something else ends it: %j",
      (way) => {
        expect(warningsOf(unbuttoned(way))).toEqual([]);
      },
    );

    it("says nothing when the finished button ends it", () => {
      expect(warningsOf(study("sketchpad", {}))).toEqual([]);
    });
  });

  describe("drawing on an image", () => {
    it.each(["https://example.com/map.png", "//example.com/map.png"])(
      "rejects an image from another site, which stops the drawing saving: %s",
      (background_image) => {
        expect(compiles(study("sketchpad", { background_image }))).toThrow(
          /an image from another site, which stops the drawing being saved/,
        );
      },
    );

    it("takes an image from another site when the drawing is not saved as an image", () => {
      const spec = study("sketchpad", {
        background_image: "https://example.com/map.png",
        save_final_image: false,
      });
      expect(compiles(spec)).not.toThrow();
    });

    it("takes a file added to the study", () => {
      expect(compiles(study("sketchpad", { background_image: "a.png" }))).not.toThrow();
    });
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

describe("a number read from a column", () => {
  const timed = (row: Record<string, unknown>): Spec => ({
    name: "rules",
    conditions: { trials: [row] },
    timeline: [
      {
        kind: "block",
        conditions: "trials",
        children: [
          {
            kind: "trial",
            plugin: "html-keyboard-response",
            params: { stimulus: "<p>hi</p>", trial_duration: { var: "duration" } },
          },
        ],
      },
    ],
  });

  it("is turned into a number when the trial starts", () => {
    const { source } = compileSpec(timed({ duration: "500" }), schemas);
    expect(source).toContain('Number(cell) : cell))(jsPsych.evaluateTimelineVariable("duration"))');
  });

  it.each([["500"], [500], [" 2.5 "]])("takes %j", (duration) => {
    expect(compiles(timed({ duration }))).not.toThrow();
  });

  it("rejects text that is not a number", () => {
    expect(compiles(timed({ duration: "half a second" }))).toThrow(
      /reads column "duration", .* which is not a number/,
    );
  });

  it("reads a blank cell as none where jsPsych's default is none", () => {
    expect(compiles(timed({ duration: "" }))).not.toThrow();
    expect(compileSpec(timed({ duration: "" }), schemas).source).toContain('cell === "" ? null');
  });

  it("rejects a blank cell where a number is needed", () => {
    const spec = timed({ duration: "" });
    const trial = (spec.timeline[0] as { children: TrialNode[] }).children[0];
    trial.plugin = "html-slider-response";
    trial.params = { stimulus: "<p>hi</p>", min: { var: "duration" } };
    expect(compiles(spec)).toThrow(/which is not a number/);
  });
});
