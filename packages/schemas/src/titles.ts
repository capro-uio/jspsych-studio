/** What a step is for, in the order the builder lists them. */
export const PLUGIN_FAMILIES = {
  show: "Show something and record the response",
  ask: "Ask questions",
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
  "audio-keyboard-response": {
    title: "Sound, answered with a key",
    summary: "Plays a sound and records which key is pressed, and how fast.",
    family: "show",
  },
  instructions: {
    title: "Instruction pages",
    summary: "Pages the participant reads, moving back and forth with keys or buttons.",
    family: "show",
  },
  "survey-likert": {
    title: "Rating scale questions",
    summary: "One or more questions answered on a labelled scale, such as disagree to agree.",
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
