import type { ParameterSchema, PluginSchema, Variants } from "./types.ts";

const number = (title: string, description: string): ParameterSchema => ({
  title,
  description,
  type: "number",
  jspsychType: "FLOAT",
});

const text = (title: string, description: string): ParameterSchema => ({
  title,
  description,
  type: "string",
  jspsychType: "STRING",
});

// The psychophysics plugin reads each object's shape and the fields that go with it without
// declaring them, so the extractor cannot see them. They are described here from the plugin's
// source; a missing one makes the plugin raise an alert mid-experiment, so `required` matters.
const CANVAS_OBJECT_FIELDS: Record<string, ParameterSchema> = {
  obj_type: {
    title: "Shape",
    description: "What kind of object this is.",
    type: "string",
    jspsychType: "SELECT",
    enum: ["cross", "circle", "rect", "line", "text", "image"],
  },
  radius: number("Radius", "Radius of the circle, in pixels."),
  width: number("Width", "Width of the rectangle, in pixels."),
  height: number("Height", "Height of the rectangle, in pixels."),
  line_length: number("Length", "Length of the line, or of each arm of the cross, in pixels."),
  angle: number("Angle", "Rotation of the line, in degrees."),
  line_color: text("Line colour", "Colour of the outline or line, as any CSS colour."),
  fill_color: text("Fill colour", "Colour inside the shape, as any CSS colour."),
  content: text("Text", "The text to draw; a line break starts a new line."),
  file: {
    title: "Image",
    description: "The image file to draw.",
    type: "string",
    format: "asset-image",
    jspsychType: "IMAGE",
  },
  scale: number("Scale", "Size relative to the image's own, e.g. 0.5 for half."),
  image_width: number("Image width", "Width to draw the image at, in pixels; keeps its shape."),
  image_height: number("Image height", "Height to draw the image at, in pixels; keeps its shape."),
};

const OUTLINE_OR_FILL = [["line_color", "fill_color"]];
const FONT = ["text_color", "fontSize", "fontFamily", "fontWeight", "fontStyle"];

const CANVAS_OBJECT_VARIANTS: Variants = {
  by: "obj_type",
  shared: ["startX", "startY", "show_start_time", "show_end_time", "origin_center"],
  options: {
    cross: { properties: ["line_length", "line_width", "line_color"], required: ["line_length"] },
    circle: {
      properties: ["radius", "line_width", "line_color", "fill_color"],
      required: ["radius"],
      any_of: OUTLINE_OR_FILL,
    },
    rect: {
      properties: ["width", "height", "line_width", "line_color", "fill_color"],
      required: ["width", "height"],
      any_of: OUTLINE_OR_FILL,
    },
    line: {
      properties: ["line_length", "angle", "line_width", "line_color"],
      required: ["line_length", "angle"],
    },
    text: { properties: ["content", ...FONT], required: ["content"] },
    image: {
      properties: ["file", "scale", "image_width", "image_height"],
      required: ["file"],
      at_most_one_of: [["scale", "image_width", "image_height"]],
    },
  },
};

function curatePsychophysics(schema: PluginSchema): PluginSchema {
  const stimuli = schema.properties.stimuli;
  const item = stimuli?.items;
  if (!item?.properties) {
    throw new Error(
      `${schema.package}@${schema.version} no longer declares "stimuli" as a list of objects; ` +
        `its curation in curated.ts needs updating`,
    );
  }
  stimuli.description = "The objects drawn on the canvas, each placed by its centre.";
  stimuli.editor = "canvas";
  item.properties = { ...item.properties, ...CANVAS_OBJECT_FIELDS };
  item.required = ["obj_type"];
  item.variants = CANVAS_OBJECT_VARIANTS;
  stimuli.examples = [[{ obj_type: "cross", line_length: 40 }]];
  return schema;
}

// Where a plugin requires a value no form can sensibly guess, such as the key that counts as the
// right category, a new step starts from these, so it can run before it is edited.
export const STARTING_EXAMPLES: Record<string, Record<string, unknown>> = {
  "categorize-html": { key_answer: "f" },
  "categorize-image": { key_answer: "f" },
  "categorize-animation": { key_answer: "f" },
  "same-different-html": { stimuli: ["<p>A</p>", "<p>A</p>"] },
  // The square that lights up, as its row and column counted from 0.
  "serial-reaction-time": { target: [0, 0] },
  "serial-reaction-time-mouse": { target: [0, 0] },
  "survey-html-form": {
    html: '<p><label>Your age <input name="age" type="number" min="18" required></label></p>',
  },
  // A word between percent signs is a gap to fill in.
  cloze: { text: "<p>The cat sat on the %mat%.</p>" },
  maxdiff: {
    alternatives: ["Option 1", "Option 2", "Option 3"],
    labels: ["Least important", "Most important"],
  },
};

// The same/different plugins read exactly two stimuli: one fewer shows "undefined", and any more
// are ignored without a word. Most-and-least takes one label for each end of its scale.
export const LIST_LENGTHS: Record<
  string,
  Record<string, { minItems?: number; maxItems?: number }>
> = {
  "same-different-html": { stimuli: { minItems: 2, maxItems: 2 } },
  "same-different-image": { stimuli: { minItems: 2, maxItems: 2 } },
  maxdiff: { alternatives: { minItems: 2 }, labels: { minItems: 2, maxItems: 2 } },
  "serial-reaction-time": { target: { minItems: 2, maxItems: 2 } },
  "serial-reaction-time-mouse": { target: { minItems: 2, maxItems: 2 } },
  // An IAT names each side with one or two categories; none makes the plugin fail.
  "iat-html": {
    left_category_label: { minItems: 1, maxItems: 2 },
    right_category_label: { minItems: 1, maxItems: 2 },
  },
  "iat-image": {
    left_category_label: { minItems: 1, maxItems: 2 },
    right_category_label: { minItems: 1, maxItems: 2 },
  },
};

// Grids whose every row holds a fixed number of places: an eye-tracking point is across, then down.
export const GRID_WIDTHS: Record<string, Record<string, number>> = {
  "webgazer-calibrate": { calibration_points: 2 },
  "webgazer-validate": { validation_points: 2 },
};

// Settings a plugin declares as text but reads as one of a few words; any other makes it fail.
// For a list, each of its entries is one of the words.
const BROWSER_FEATURES = [
  "width",
  "height",
  "webaudio",
  "browser",
  "browser_version",
  "mobile",
  "os",
  "fullscreen",
  "vsync_rate",
  "webcam",
  "microphone",
];

export const FIXED_CHOICES: Record<string, Record<string, string[]>> = {
  "browser-check": { features: BROWSER_FEATURES, skip_features: BROWSER_FEATURES },
  sketchpad: {
    canvas_shape: ["rectangle", "circle"],
    prompt_location: ["abovecanvas", "belowcanvas", "belowbutton"],
  },
};

// Sizes a plugin divides as decimals but declares as whole numbers, where real sizes are not whole:
// a bank card is 8.56 by 5.398 centimetres.
export const DECIMAL_PARAMETERS: Record<string, string[]> = {
  resize: ["item_width", "item_height", "pixels_per_unit"],
};

// Settings a plugin cannot do without but declares with a default of nothing: a form with no form.
export const REQUIRED_PARAMETERS: Record<string, string[]> = {
  "survey-html-form": ["html"],
};

// Keys that must differ for the plugin's answers, and so its scoring, to mean anything.
export const DISTINCT_KEYS: Record<string, [string, string][]> = {
  "same-different-html": [["same_key", "different_key"]],
  "same-different-image": [["same_key", "different_key"]],
  "iat-html": [["left_category_key", "right_category_key"]],
  "iat-image": [["left_category_key", "right_category_key"]],
  "visual-search-circle": [["target_present_key", "target_absent_key"]],
};

// Columns a plugin writes without declaring them in its info: the same/different plugins record a
// response to the first stimulus when it stays up until one is given.
export const UNDECLARED_RECORDS: Record<string, string[]> = {
  "same-different-html": ["rt_stim1", "response_stim1"],
  "same-different-image": ["rt_stim1", "response_stim1"],
};

// Stimulus elements a plugin gives an id not of its own name: the mouse version of the serial
// reaction time task borrows the keyboard version's, and an animation shows its frames in an image.
export const STIMULUS_ELEMENTS: Record<string, string> = {
  "serial-reaction-time-mouse": "jspsych-serial-reaction-time-stimulus",
  animation: "jspsych-animation-image",
};

// Scripts an extension calls without importing, so they must be on the page before it.
export const EXTENSION_LIBRARIES: Record<string, { package: string; file: string }[]> = {
  "@jspsych/extension-webgazer": [{ package: "webgazer", file: "dist/webgazer.js" }],
};

// Packages built into another package's browser bundle, which a download carrying that bundle
// carries too and has to credit. The DataPipe extension's bundle holds Firebase, which DataPipe
// stages rows in.
export const BUNDLED_PACKAGES: Record<string, string[]> = {
  "@jspsych/extension-pipe": ["firebase"],
};

// Files a library fetches from beside its own script while it runs, which a page that carries its
// own copies has to carry too. WebGazer's face mesh loads its model and either WebAssembly build.
const FACE_MESH = "dist/mediapipe/face_mesh";
export const LIBRARY_RUNTIME_FILES: Record<string, string[]> = {
  webgazer: [
    "face_mesh.js",
    "face_mesh.binarypb",
    "face_mesh_solution_packed_assets_loader.js",
    "face_mesh_solution_packed_assets.data",
    "face_mesh_solution_simd_wasm_bin.js",
    "face_mesh_solution_simd_wasm_bin.wasm",
    "face_mesh_solution_simd_wasm_bin.data",
    "face_mesh_solution_wasm_bin.js",
    "face_mesh_solution_wasm_bin.wasm",
  ].map((file) => `${FACE_MESH}/${file}`),
};

/** Plugins from outside jsPsych's own set, each with what its declared parameters leave out. */
export const CURATED_PLUGINS: Record<string, (schema: PluginSchema) => PluginSchema> = {
  "@kurokida/jspsych-psychophysics": curatePsychophysics,
};
