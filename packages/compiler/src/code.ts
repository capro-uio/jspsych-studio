import { parse } from "acorn";
import type { CodeValue } from "./types.ts";
import { isPlainObject } from "./variables.ts";

export function isCode(value: unknown): value is CodeValue {
  return isPlainObject(value) && "code" in value;
}

/** Whether a parameter or field of this jsPsych type is handed a function rather than a value. */
export function takesFunction(jspsychType?: string) {
  return jspsychType === "FUNCTION";
}

/** Whether code sits somewhere inside a value the compiler would emit as plain data. */
export function containsCode(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCode);
  return isPlainObject(value) && (isCode(value) || Object.values(value).some(containsCode));
}

// The experiment can sit in an inline script, where the HTML parser ends the script at `</script`
// before JavaScript sees it, and `<!--` can hide the rest of the page from the parser.
const SCRIPT_BREAKERS = /<\/script|<!--/i;

// The code is emitted exactly as it is checked here, inside its own parentheses, so a value that
// passes is one expression and cannot close the parameter it sits in and add statements after it.
export function codeExpression(code: string) {
  return `(${code}\n)`;
}

/** Why a piece of code cannot be emitted, or null when it can. */
export function codeProblem(code: unknown): string | null {
  if (typeof code !== "string" || code.trim() === "") return "holds no code";
  if (SCRIPT_BREAKERS.test(code)) {
    return 'contains "</script" or "<!--", which would end the page\'s script early; split it, as in "<" + "/script>"';
  }
  try {
    const program = parse(codeExpression(code), { ecmaVersion: "latest", sourceType: "script" });
    if (program.body.length !== 1 || program.body[0].type !== "ExpressionStatement") {
      return "should be a single JavaScript expression";
    }
  } catch (error) {
    return `is not valid JavaScript (${(error as Error).message})`;
  }
  return null;
}
