import { escapeHtmlText } from "../emit.ts";
import { generatorLabel } from "../metadata.ts";
import { formatSource } from "../format.ts";
import type { CompileResult } from "../types.ts";

export interface HtmlTargetOptions {
  title: string;
  /** Load the experiment from this file instead of writing it into the page. */
  sourceFile?: string;
  /** `"cdn"` emits unpkg URLs; any other value is a base path serving the npm packages. */
  base?: string;
  /** Which Studio built the page; defaults to this build's own version. */
  studio?: string;
  /** Inline scripts that run before jsPsych loads, such as the preview's focus guard. */
  headScripts?: string[];
}

const CDN = "https://unpkg.com";

// CDN URLs pin exact versions: a floating range would let a plugin update change the behaviour of
// an experiment that is already collecting data.
function scriptUrls(result: CompileResult, base: string) {
  const core =
    base === "cdn"
      ? `${CDN}/jspsych@${result.jspsych}/dist/index.browser.min.js`
      : `${base}/jspsych/dist/index.browser.min.js`;
  const pluginUrls = result.plugins.map((plugin) => {
    const { name, version } = result.packages[plugin];
    return base === "cdn"
      ? `${CDN}/${name}@${version}/dist/index.browser.min.js`
      : `${base}/${name}/dist/index.browser.min.js`;
  });
  const stylesheet =
    base === "cdn"
      ? `${CDN}/jspsych@${result.jspsych}/css/jspsych.css`
      : `${base}/jspsych/css/jspsych.css`;
  return { core, pluginUrls, stylesheet };
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
  const { core, pluginUrls, stylesheet } = scriptUrls(result, options.base ?? "cdn");
  const scripts = [
    ...(options.headScripts ?? []).map((script) => `    <script>${script}</script>`),
    ...[core, ...pluginUrls].map((url) => `    <script src="${url}"></script>`),
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
    <meta name="generator" content="${generatorLabel(options.studio)}" />
    <meta name="description" content="${escapeHtmlText(options.title)}, a behavioural experiment." />
    <title>${escapeHtmlText(options.title)}</title>
    <link rel="stylesheet" href="${stylesheet}" />
${result.styles ? `    <style>\n${result.styles.replace(/^/gm, "      ").trimEnd()}\n    </style>` : ""}
${scripts}
  </head>
  <body>
${
  options.sourceFile
    ? `    <script src="${options.sourceFile}"></script>`
    : `    <script>
${body
  .trimEnd()
  .split("\n")
  .map((line) => (line ? `      ${line}` : ""))
  .join("\n")}
    </script>`
}
  </body>
</html>
`;

  return { html, body };
}
