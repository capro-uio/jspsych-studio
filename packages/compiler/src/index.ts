export { compileSpec } from "./compile.ts";
export { DATAPIPE_URL } from "./data.ts";
export { DEFAULT_BACKGROUND, DEFAULT_TEXT, backgroundColor, textColor } from "./appearance.ts";
export type { CompileOptions } from "./compile.ts";
export { formatSource } from "./format.ts";
export { emitHtml } from "./targets/html.ts";
export { projectFiles } from "./targets/project.ts";
export {
  dataColumns,
  datasetDescription,
  GENERATOR,
  GENERATOR_URL,
  GENERATOR_VERSION,
  generatorLabel,
} from "./metadata.ts";
export type { ProjectFile } from "./targets/project.ts";
export type { HtmlOutput, HtmlTargetOptions } from "./targets/html.ts";
export { SpecError, validateSpec } from "./validate.ts";
export type { Problem } from "./validate.ts";
export { conditionColumns, isVariableReference, slotsOf } from "./variables.ts";
export type * from "./types.ts";
