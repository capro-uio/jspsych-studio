import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { assetsOfType, preloadListOf } from "../src/assets.ts";
import type { Asset, Spec } from "../src/types.ts";
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

describe("preloading files", () => {
  const html: Spec["timeline"][number] = {
    kind: "trial",
    plugin: "html-keyboard-response",
    params: { stimulus: "<p>hi</p>" },
  };
  const withAssets = (assets: Asset[]): Spec => ({ name: "media", assets, timeline: [html] });
  const preloadOf = (source: string) => {
    const start = source.indexOf("type: jsPsychPreload");
    return source.slice(start, source.indexOf("\n}", start));
  };

  it("puts each file in the list the preload plugin loads it with", () => {
    const { source } = compileSpec(
      withAssets([
        { name: "face.png", url: PIXEL },
        { name: "tone.wav", url: "data:audio/wav;base64,UklGRg==" },
        { name: "clip.webm", url: "data:video/webm;base64,GkXfow==" },
        { name: "voice.webm", url: "data:audio/webm;base64,GkXfow==" },
      ]),
      schemas,
    );
    const preload = preloadOf(source);
    expect(preload).toContain('images: [assets["face.png"]],');
    expect(preload).toContain('audio: [assets["tone.wav"], assets["voice.webm"]],');
    expect(preload).toContain('video: [assets["clip.webm"]],');
  });

  it("leaves out a list with no files in it", () => {
    const preload = preloadOf(
      compileSpec(withAssets([{ name: "face.png", url: PIXEL }]), schemas).source,
    );
    expect(preload).not.toContain("audio:");
    expect(preload).not.toContain("video:");
  });

  it("adds no preload step for files that are not media", () => {
    const { source, plugins } = compileSpec(
      withAssets([{ name: "words.txt", url: "data:text/plain;base64,aGk=" }]),
      schemas,
    );
    expect(plugins).not.toContain("preload");
    expect(source).toContain('"words.txt"');
  });

  it("goes by the file's extension when its address names no media type", () => {
    const hosted = (name: string): Asset => ({ name, url: `https://example.org/${name}` });
    expect(preloadListOf(hosted("Face.JPG"))).toBe("images");
    expect(preloadListOf(hosted("tone.mp3"))).toBe("audio");
    expect(preloadListOf(hosted("clip.mp4"))).toBe("video");
    expect(preloadListOf(hosted("words.txt"))).toBeNull();
    expect(preloadListOf(hosted("README"))).toBeNull();
  });

  it("goes by the extension when the browser did not know the file's type", () => {
    const unknown = (name: string): Asset => ({
      name,
      url: "data:application/octet-stream;base64,AAAA",
    });
    expect(preloadListOf(unknown("voice.opus"))).toBe("audio");
    expect(preloadListOf(unknown("data.bin"))).toBeNull();
  });
});

describe("assetsOfType", () => {
  const assets: Asset[] = [
    { name: "face.png", url: PIXEL },
    { name: "tone.wav", url: "data:audio/wav;base64,UklGRg==" },
    { name: "notes.txt", url: "data:text/plain;base64,aGk=" },
  ];

  it("keeps the files a media parameter of that type can use", () => {
    expect(assetsOfType(assets, "IMAGE").map((asset) => asset.name)).toEqual(["face.png"]);
    expect(assetsOfType(assets, "AUDIO").map((asset) => asset.name)).toEqual(["tone.wav"]);
    expect(assetsOfType(assets, "VIDEO")).toEqual([]);
  });

  it("keeps none for a parameter that is not media", () => {
    expect(assetsOfType(assets, "STRING")).toEqual([]);
  });
});
