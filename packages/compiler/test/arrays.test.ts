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

describe("lists of choices", () => {
  const plugins = {
    ...schemas,
    plugins: {
      pick: {
        plugin: "pick",
        title: "Pick colours",
        summary: "Picks colours.",
        family: "ask" as const,
        package: "pick",
        version: "1.0.0",
        required: [],
        properties: {
          colours: {
            title: "colours",
            type: "array" as const,
            jspsychType: "SELECT" as const,
            items: {
              title: "colours",
              type: "string" as const,
              jspsychType: "SELECT" as const,
              enum: ["red", "blue"],
            },
          },
        },
      },
    },
  };
  const pick = (colours: ParameterValue): Spec => ({
    name: "choices",
    timeline: [{ kind: "trial", plugin: "pick", params: { colours } }],
  });

  it("accepts several of the options", () => {
    expect(() => compileSpec(pick(["red", "blue"]), plugins)).not.toThrow();
  });

  it("rejects an entry that is not one of the options", () => {
    expect(() => compileSpec(pick(["red", "green"]), plugins)).toThrow(
      /expects each entry to be one of "red", "blue"/,
    );
  });
});
