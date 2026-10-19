/** What a step is for, in the order the builder lists them. */
export const PLUGIN_FAMILIES = {
  show: "Show something and record the response",
  ask: "Ask questions",
  judge: "Categorise or compare",
  canvas: "Draw on a canvas",
  setup: "Set up and run",
} as const;

export type PluginFamily = keyof typeof PLUGIN_FAMILIES;

export interface PluginLabel {
  /** What an author calls the step, rather than the plugin's machine name. */
  title: string;
  /** One line on what a participant sees or what the step does. */
  summary: string;
  family: PluginFamily;
}

// jsPsych names plugins by stimulus and response for code to read; these are for the people
// building a study. A plugin without one fails extraction, so every plugin added is named here.
export const PLUGIN_LABELS: Record<string, PluginLabel> = {
  "html-keyboard-response": {
    title: "Text, answered with a key",
    summary: "Shows text or HTML and records which key is pressed, and how fast.",
    family: "show",
  },
  "html-button-response": {
    title: "Text, answered with buttons",
    summary: "Shows text or HTML and records which button is clicked, and how fast.",
    family: "show",
  },
  "image-keyboard-response": {
    title: "Image, answered with a key",
    summary: "Shows an image and records which key is pressed, and how fast.",
    family: "show",
  },
  "image-button-response": {
    title: "Image, answered with buttons",
    summary: "Shows an image and records which button is clicked, and how fast.",
    family: "show",
  },
  "audio-button-response": {
    title: "Sound, answered with buttons",
    summary: "Plays a sound and records which button is clicked, and how fast.",
    family: "show",
  },
  "video-keyboard-response": {
    title: "Video, answered with a key",
    summary: "Plays a video and records which key is pressed, and how fast.",
    family: "show",
  },
  "video-button-response": {
    title: "Video, answered with buttons",
    summary: "Plays a video and records which button is clicked, and how fast.",
    family: "show",
  },
  "audio-keyboard-response": {
    title: "Sound, answered with a key",
    summary: "Plays a sound and records which key is pressed, and how fast.",
    family: "show",
  },
  "html-slider-response": {
    title: "Text, answered on a slider",
    summary: "Shows text or HTML and records where on a scale the participant sets a slider.",
    family: "show",
  },
  "image-slider-response": {
    title: "Image, answered on a slider",
    summary: "Shows an image and records where on a scale the participant sets a slider.",
    family: "show",
  },
  "audio-slider-response": {
    title: "Sound, answered on a slider",
    summary: "Plays a sound and records where on a scale the participant sets a slider.",
    family: "show",
  },
  "video-slider-response": {
    title: "Video, answered on a slider",
    summary: "Plays a video and records where on a scale the participant sets a slider.",
    family: "show",
  },
  animation: {
    title: "Images as an animation",
    summary: "Shows images one after another as an animation, and records any keys pressed.",
    family: "show",
  },
  instructions: {
    title: "Instruction pages",
    summary: "Pages the participant reads, moving back and forth with keys or buttons.",
    family: "show",
  },
  "categorize-html": {
    title: "Text, sorted into a category",
    summary: "Shows text, records the key pressed, and tells the participant if it was right.",
    family: "judge",
  },
  "categorize-image": {
    title: "Image, sorted into a category",
    summary: "Shows an image, records the key pressed, and tells the participant if it was right.",
    family: "judge",
  },
  "categorize-animation": {
    title: "Animation, sorted into a category",
    summary: "Plays images as an animation, records the key pressed, and gives feedback.",
    family: "judge",
  },
  "same-different-html": {
    title: "Two texts, same or different",
    summary: "Shows two texts one after the other and records whether they were judged the same.",
    family: "judge",
  },
  "same-different-image": {
    title: "Two images, same or different",
    summary: "Shows two images one after the other and records whether they were judged the same.",
    family: "judge",
  },
  "free-sort": {
    title: "Images, sorted by dragging",
    summary: "Lets the participant drag images into place, and records where each one ends up.",
    family: "judge",
  },
  "iat-html": {
    title: "Implicit association, with text",
    summary: "One trial of an implicit association test: text sorted left or right by a key.",
    family: "judge",
  },
  "iat-image": {
    title: "Implicit association, with images",
    summary: "One trial of an implicit association test: an image sorted left or right by a key.",
    family: "judge",
  },
  "visual-search-circle": {
    title: "Visual search",
    summary:
      "Shows images in a circle and records whether the participant saw the target among them.",
    family: "judge",
  },
  cloze: {
    title: "Fill in the blanks",
    summary:
      "Shows text with words left out, and records what the participant types into each gap.",
    family: "ask",
  },
  maxdiff: {
    title: "Most and least",
    summary: "Asks which of several options is most and which is least, on one scale.",
    family: "ask",
  },
  sketchpad: {
    title: "Drawing",
    summary:
      "Gives the participant a canvas to draw on, and saves each drawing in the data as an image.",
    family: "ask",
  },
  "survey-likert": {
    title: "Rating scale questions",
    summary: "One or more questions answered on a labelled scale, such as disagree to agree.",
    family: "ask",
  },
  "survey-multi-choice": {
    title: "Multiple-choice questions",
    summary: "One or more questions, each answered by choosing one of its options.",
    family: "ask",
  },
  "survey-multi-select": {
    title: "Checkbox questions",
    summary: "One or more questions, each answered by ticking any number of its options.",
    family: "ask",
  },
  "survey-text": {
    title: "Written-answer questions",
    summary: "One or more questions answered by typing.",
    family: "ask",
  },
  psychophysics: {
    title: "Shapes on a canvas",
    summary: "Places shapes, text and images on a canvas, and records a key press or click.",
    family: "canvas",
  },
  resize: {
    title: "Calibrate screen size",
    summary: "Has the participant resize a box to match a card, so later stimuli can be scaled.",
    family: "setup",
  },
  "virtual-chinrest": {
    title: "Measure viewing distance",
    summary:
      "Estimates screen size and how far the participant sits, from a card and the blind spot.",
    family: "setup",
  },
  "browser-check": {
    title: "Check the browser",
    summary: "Records the browser, screen and devices, and can turn away those your rule excludes.",
    family: "setup",
  },
  "external-html": {
    title: "Page from your website",
    summary:
      "Shows an HTML page served beside the study, such as a consent form; not in the preview.",
    family: "show",
  },
  "survey-html-form": {
    title: "Your own form",
    summary: "Shows a form written in HTML and records what is filled in, by each field's name.",
    family: "ask",
  },
  fullscreen: {
    title: "Switch to full screen",
    summary: "Asks the participant to enter, or leave, full-screen mode.",
    family: "setup",
  },
  preload: {
    title: "Load files in advance",
    summary: "Loads images, sounds and videos before the trials that need them.",
    family: "setup",
  },
  "call-function": {
    title: "Run a function",
    summary: "Runs code written for this study, with nothing shown to the participant.",
    family: "setup",
  },
};
