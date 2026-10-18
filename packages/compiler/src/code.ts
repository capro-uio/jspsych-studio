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

// A line starting with `-->` is a comment to browsers and to acorn, but not to the parser the
// formatter uses, so a study holding one would pass validation and then fail to export.
const HTML_CLOSE_COMMENT = /^\s*-->/m;

// Browsers participants are likely to use run ES2022 throughout; newer syntax could fail in theirs.
const ECMA_VERSION = 2022;

export function codeExpression(code: string) {
  return `(${code}\n)`;
}

// The code is emitted exactly as it is checked here, inside its own parentheses. Requiring those
// parentheses to enclose the whole of it means it cannot close them early, as `a), (b` would, to
// put a second expression or a statement beside the parameter it sits in.
function isOneEnclosedExpression(wrapped: string) {
  const program = parse(wrapped, {
    ecmaVersion: ECMA_VERSION,
    sourceType: "script",
    preserveParens: true,
  });
  if (program.body.length !== 1) return false;
  const statement = program.body[0];
  return (
    statement.type === "ExpressionStatement" &&
    statement.expression.type === "ParenthesizedExpression" &&
    statement.expression.start === 0 &&
    statement.expression.end === wrapped.length
  );
}

/** Why a piece of code cannot be emitted, or null when it can. */
export function codeProblem(code: unknown): string | null {
  if (typeof code !== "string" || code.trim() === "") return "holds no code";
  if (SCRIPT_BREAKERS.test(code)) {
    return 'contains "</script" or "<!--", which would end the page\'s script early; split it, as in "<" + "/script>"';
  }
  if (HTML_CLOSE_COMMENT.test(code)) {
    return 'starts a line with "-->"; write the comment as // instead';
  }
  try {
    if (!isOneEnclosedExpression(codeExpression(code))) {
      return "should be a single JavaScript expression";
    }
  } catch (error) {
    return `is not valid JavaScript (${(error as Error).message})`;
  }
  return null;
}
