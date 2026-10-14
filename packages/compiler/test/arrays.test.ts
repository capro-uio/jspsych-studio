import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import type { ParameterValue, Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const instructions = (pages: ParameterValue): Spec => ({
  name: "pages",
  timeline: [{ kind: "trial", plugin: "instructions", params: { pages } }],
});

describe("array parameters", () => {
  it("compiles a list of pages", () => {
    const { source } = compileSpec(instructions(["<p>one</p>", "<p>two</p>"]), schemas);
    expect(source).toContain('pages: ["\\u003cp>one\\u003c/p>","\\u003cp>two\\u003c/p>"]');
  });

  it("rejects a single value where the plugin expects a list", () => {
    expect(() => compileSpec(instructions("<p>one</p>"), schemas)).toThrow(
      /expects a list of values/,
    );
  });

  it("still accepts the keyword forms of a key list", () => {
    const spec: Spec = {
      name: "keys",
      timeline: [
        {
          kind: "trial",
          plugin: "html-keyboard-response",
          params: { stimulus: "hi", choices: "NO_KEYS" },
        },
      ],
    };
    expect(() => compileSpec(spec, schemas)).not.toThrow();
  });

  it("resolves every entry of a media list through the asset map", () => {
    const spec: Spec = {
      name: "media-list",
      assets: [
        { name: "a.png", url: "data:image/png;base64,AA" },
        { name: "b.png", url: "data:image/png;base64,BB" },
      ],
      timeline: [
        {
          kind: "trial",
          plugin: "preload",
          params: { images: ["a.png", "b.png"] },
        },
      ],
    };
    expect(compileSpec(spec, schemas).source).toContain('images: [asset("a.png"), asset("b.png")]');
  });
});
