import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import type { Spec } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

const withImage = (stimulus: Spec["timeline"][number]): Spec => ({
  name: "pictures",
  assets: [{ name: "face.png", url: PIXEL }],
  timeline: [stimulus],
});

describe("media assets", () => {
  it("resolves a named file through the asset map", () => {
    const { source } = compileSpec(
      withImage({
        kind: "trial",
        plugin: "image-keyboard-response",
        params: { stimulus: "face.png" },
      }),
      schemas,
    );
    expect(source).toContain(`"face.png": "${PIXEL}"`);
    expect(source).toContain('stimulus: asset("face.png")');
  });

  it("preloads every file before the first trial", () => {
    const { source, plugins } = compileSpec(
      withImage({
        kind: "trial",
        plugin: "image-keyboard-response",
        params: { stimulus: "face.png" },
      }),
      schemas,
    );
    expect(plugins).toContain("preload");
    expect(source.indexOf("jsPsychPreload")).toBeLessThan(source.indexOf("jsPsychImageKeyboard"));
  });

  it("resolves a file named by a conditions column at run time", () => {
    const spec: Spec = {
      name: "pictures",
      assets: [{ name: "face.png", url: PIXEL }],
      conditions: { rows: [{ picture: "face.png" }] },
      timeline: [
        {
          kind: "block",
          conditions: "rows",
          children: [
            {
              kind: "trial",
              plugin: "image-keyboard-response",
              params: { stimulus: { var: "picture" } },
            },
          ],
        },
      ],
    };
    expect(compileSpec(spec, schemas).source).toContain(
      'stimulus: () => asset(jsPsych.evaluateTimelineVariable("picture"))',
    );
  });

  it("leaves a hosted path alone", () => {
    const spec = withImage({
      kind: "trial",
      plugin: "image-keyboard-response",
      params: { stimulus: "https://example.org/face.png" },
    });
    expect(() => compileSpec(spec, schemas)).not.toThrow();
  });

  it("rejects a file name that was never added", () => {
    const spec = withImage({
      kind: "trial",
      plugin: "image-keyboard-response",
      params: { stimulus: "fcae.png" },
    });
    expect(() => compileSpec(spec, schemas)).toThrow(/neither an added file nor a path/);
  });
});
