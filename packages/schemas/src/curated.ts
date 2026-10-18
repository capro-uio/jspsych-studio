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
  Record<string, { minItems: number; maxItems: number }>
> = {
  "same-different-html": { stimuli: { minItems: 2, maxItems: 2 } },
  "same-different-image": { stimuli: { minItems: 2, maxItems: 2 } },
  maxdiff: { labels: { minItems: 2, maxItems: 2 } },
};

// Columns a plugin writes without declaring them in its info: the same/different plugins record a
// response to the first stimulus when it stays up until one is given.
export const UNDECLARED_RECORDS: Record<string, string[]> = {
  "same-different-html": ["rt_stim1", "response_stim1"],
  "same-different-image": ["rt_stim1", "response_stim1"],
};

/** Plugins from outside jsPsych's own set, each with what its declared parameters leave out. */
export const CURATED_PLUGINS: Record<string, (schema: PluginSchema) => PluginSchema> = {
  "@kurokida/jspsych-psychophysics": curatePsychophysics,
};
