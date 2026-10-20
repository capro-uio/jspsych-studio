import { escapeHtmlText } from "../emit.ts";
import { PACKAGE_ATTRIBUTE } from "../gaze.ts";
import { BROWSER_BUNDLE, JSPSYCH_STYLESHEET } from "@tachisto/schemas/files";
import { cdnUrl, packageFileKey, thirdPartyComment } from "../package-files.ts";
import { generatorLabel } from "../metadata.ts";
import { formatSource } from "../format.ts";
import type { CompileResult } from "../types.ts";

export interface HtmlTargetOptions {
  title: string;
  /** Load the experiment from this file instead of writing it into the page. */
  sourceFile?: string;
  /**
   * Where the page loads jsPsych and its plugins from: `"cdn"` for unpkg, checked against each
   * file's recorded hash, or a path to a folder holding them as `<package>/<path>`.
   */
  base?: string;
  /** The packages' files by {@link packageFileKey}, to write into the page instead of linking. */
  inline?: Record<string, string>;
  /** Which Tachisto built the page; defaults to this build's own version. */
  tachisto?: string;
  /** Inline scripts that run before jsPsych loads, such as the preview's focus guard. */
  headScripts?: string[];
}

interface PageFile {
  package: string;
  version: string;
  path: string;
  /** Extras say which package they are, so the experiment can find files beside them. */
  named?: boolean;
}

/** The files the page itself names, in the order it loads them; the stylesheet comes first. */
function pageFiles(result: CompileResult): PageFile[] {
  return [
    { package: "jspsych", version: result.jspsych, path: JSPSYCH_STYLESHEET },
    { package: "jspsych", version: result.jspsych, path: BROWSER_BUNDLE },
    ...result.scripts.map(({ package: name, version, file }) => ({
      package: name,
      version,
      path: file,
      named: true,
    })),
    ...result.plugins.map((plugin) => {
      const { name, version } = result.packages[plugin];
      return { package: name, version, path: BROWSER_BUNDLE };
    }),
  ];
}

/**
 * Files the study loads while it runs rather than naming in the page, such as the eye tracker's
 * model. A page that carries its scripts inside it has no folder for these to be found in.
 */
export function filesLoadedWhileRunning(result: CompileResult) {
  const named = new Set(pageFiles(result).map(packageFileKey));
  return result.files.filter((file) => !named.has(packageFileKey(file)));
}

// Text written inside a script or style element ends it wherever it spells the closing tag, so
// that spelling is broken up; inside the JavaScript and CSS these files hold, the escape is
// harmless.
const insideElement = (text: string, tag: string) =>
  text.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1").replace(/<!--/g, "<\\!--");

function urlOf(file: PageFile, base: string) {
  return base === "cdn" ? cdnUrl(file) : `${base}/${packageFileKey(file)}`;
}

function tagFor(file: PageFile, result: CompileResult, options: HtmlTargetOptions) {
  const isStylesheet = file.path === JSPSYCH_STYLESHEET;
  const name = file.named ? ` ${PACKAGE_ATTRIBUTE}="${escapeHtmlText(file.package)}"` : "";
  if (options.inline) {
    const text = options.inline[packageFileKey(file)];
    if (text === undefined) throw new Error(`no copy of ${packageFileKey(file)} to write in`);
    return isStylesheet
      ? `<style>\n${insideElement(text, "style")}\n</style>`
      : `<script${name}>\n${insideElement(text, "script")}\n</script>`;
  }
  const base = options.base ?? "cdn";
  const url = urlOf(file, base);
  // A CDN file is checked against the hash recorded for it, so a changed copy is refused rather
  // than run; files beside the page are the author's own.
  const integrity =
    base === "cdn"
      ? result.files.find((each) => packageFileKey(each) === packageFileKey(file))?.integrity
      : undefined;
  const check = integrity ? ` integrity="${integrity}" crossorigin="anonymous"` : "";
  return isStylesheet
    ? `<link rel="stylesheet" href="${url}"${check} />`
    : `<script${name} src="${url}"${check}></script>`;
}

export interface HtmlOutput {
  html: string;
  /** The formatted experiment source, so callers can show it without formatting again. */
  body: string;
}

export async function emitHtml(
  result: CompileResult,
  options: HtmlTargetOptions,
): Promise<HtmlOutput> {
  if (options.inline && filesLoadedWhileRunning(result).length > 0) {
    throw new Error(
      "this study loads files while it runs, such as the eye tracker's model, so it cannot be " +
        "carried in one page; download the project folder instead",
    );
  }
  const [stylesheet, ...packageScripts] = pageFiles(result).map((file) =>
    tagFor(file, result, options),
  );
  const scripts = [
    ...(options.headScripts ?? []).map((script) => `    <script>${script}</script>`),
    ...packageScripts.map((tag) => `    ${tag}`),
  ].join("\n");

  // The jsPsych browser bundle already declares a global `initJsPsych`, so the experiment body
  // must not re-declare it. `studioExperiment` is the handle the preview iframe talks to.
  const body = await formatSource(`${result.source}
window.studioExperiment = { jsPsych };
`);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
${options.inline ? `    ${thirdPartyComment(result.files).replace(/\n/g, "\n    ")}\n` : ""}    <meta name="generator" content="${generatorLabel(options.tachisto)}" />
    <meta name="description" content="${escapeHtmlText(options.title)}, a behavioural experiment." />
    <title>${escapeHtmlText(options.title)}</title>
    ${stylesheet}
${result.styles ? `    <style>\n${result.styles.replace(/^/gm, "      ").trimEnd()}\n    </style>` : ""}
${scripts}
  </head>
  <body>
${
  options.sourceFile
    ? `    <script src="${options.sourceFile}"></script>`
    : // Left unindented: indenting each line would change the text of a multi-line template
      // literal, which author code can hold.
      `    <script>
${body.trimEnd()}
    </script>`
}
  </body>
</html>
`;

  return { html, body };
}
