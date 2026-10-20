import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { emitHtml } from "../src/targets/html.ts";
import type { Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const specWith = (stimulus: string): Spec => ({
  name: "escaping",
  timeline: [{ kind: "trial", plugin: "html-keyboard-response", params: { stimulus } }],
});

describe("emitted literals", () => {
  it("escapes a closing script tag so the inline script survives", () => {
    const { source } = compileSpec(specWith("<p>a </script> b</p>"), schemas);
    expect(source).not.toContain("</script>");
    expect(source).toContain("\\u003c/script>");
  });

  it("escapes line separators that JavaScript treats as line breaks", () => {
    const { source } = compileSpec(specWith("a\u2028b\u2029c"), schemas);
    expect(source).toContain("\\u2028");
    expect(source).toContain("\\u2029");
  });

  it("wraps a bound value with a replacer function so $-patterns stay literal", () => {
    const spec: Spec = {
      name: "wrapped",
      conditions: { rows: [{ word: "cost $& total" }] },
      timeline: [
        {
          kind: "block",
          conditions: "rows",
          children: [
            {
              kind: "trial",
              plugin: "html-keyboard-response",
              params: { stimulus: { var: "word", wrap: "<p>{}</p>" } },
            },
          ],
        },
      ],
    };
    expect(compileSpec(spec, schemas).source).toContain(
      '.replace("{}", () => jsPsych.evaluateTimelineVariable("word"))',
    );
  });
});

describe("emitHtml", () => {
  it("runs head scripts before jsPsych loads", async () => {
    const compiled = compileSpec(specWith("<p>hi</p>"), schemas);
    const { html } = await emitHtml(compiled, { title: "t", headScripts: ["window.first = 1;"] });
    expect(html.indexOf("window.first = 1;")).toBeGreaterThan(-1);
    expect(html.indexOf("window.first = 1;")).toBeLessThan(html.indexOf("<script src="));
  });

  it("adds no head scripts unless asked", async () => {
    const compiled = compileSpec(specWith("<p>hi</p>"), schemas);
    const { html } = await emitHtml(compiled, { title: "t" });
    expect(html).not.toMatch(/<script>[^\n]/);
  });

  it("pins exact versions rather than a floating range", async () => {
    const compiled = compileSpec(specWith("hi"), schemas);
    const { html } = await emitHtml(compiled, { title: "pinning" });
    const plugin = compiled.packages["html-keyboard-response"];
    expect(html).toContain(`jspsych@${compiled.jspsych}/dist`);
    expect(html).toContain(`${plugin.name}@${plugin.version}/`);
    expect(compiled.jspsych).toMatch(/^\d+\.\d+\.\d+/);
    expect(html).not.toContain("plugin-html-keyboard-response@2/");
  });

  it("keeps a quote in the experiment name inside the page's description", async () => {
    const compiled = compileSpec(specWith("<p>hi</p>"), schemas);
    const { html } = await emitHtml(compiled, { title: 'a" onload="stolen()' });
    expect(html).toContain('content="a&quot; onload=&quot;stolen()');
    expect(html).not.toContain('onload="stolen()"');
  });

  it("escapes the experiment name in the document title", async () => {
    const { html } = await emitHtml(compileSpec(specWith("hi"), schemas), {
      title: "</title><script>stolen()</script>",
    });
    expect(html).toContain("<title>&lt;/title&gt;&lt;script&gt;stolen()");
    expect(html).not.toContain("<title></title>");
  });
});
