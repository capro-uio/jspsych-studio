import type { CompileResult } from "./types.ts";

/** What the command line says once a study is built: each warning, then where the page went. */
export function compileReport(name: string, result: CompileResult, outputPath: string) {
  return {
    warnings: result.warnings.map((warning) => `warning: ${warning.message}`),
    summary: `${name}: ${result.plugins.length} plugin(s) -> ${outputPath}`,
  };
}
