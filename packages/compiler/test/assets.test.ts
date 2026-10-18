import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { assetAddress, assetPath, assetsOfType, preloadListOf } from "../src/assets.ts";
import type { Asset, Spec, TrialNode } from "../src/types.ts";
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

  it("preloads audio, video, and images through their own lists", () => {
    const spec: Spec = {
      name: "media",
      assets: [
        { name: "face.png", url: PIXEL },
        { name: "beep.mp3", url: "data:audio/mpeg;base64,AAAA" },
        { name: "clip.mp4", url: "data:video/mp4;base64,AAAA" },
      ],
      timeline: [
        { kind: "trial", plugin: "image-keyboard-response", params: { stimulus: "face.png" } },
      ],
    };
    const { source } = compileSpec(spec, schemas);
    expect(source).toContain('images: [assets["face.png"]]');
    expect(source).toContain('audio: [assets["beep.mp3"]]');
    expect(source).toContain('video: [assets["clip.mp4"]]');
    expect(source).not.toContain("Object.values(assets)");
  });

  it("falls back to the file extension when the URL does not name a media type", () => {
    const spec: Spec = {
      name: "media",
      assets: [
        { name: "face.png", url: PIXEL },
        { name: "beep.wav", url: "data:application/octet-stream;base64,AAAA" },
      ],
      timeline: [
        { kind: "trial", plugin: "image-keyboard-response", params: { stimulus: "face.png" } },
      ],
    };
    expect(compileSpec(spec, schemas).source).toContain('audio: [assets["beep.wav"]]');
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

describe("files beside the page", () => {
  const card = { name: "bank card (1).png", url: PIXEL };

  it("are addressed with spaces and brackets escaped, so CSS without quotes reads them", () => {
    expect(assetAddress(card)).toBe("assets/bank%20card%20%281%29.png");
  });

  it("are addressed by the name they are saved under when it needs no escaping", () => {
    expect(assetAddress({ name: "face.png", url: PIXEL })).toBe(
      assetPath({ name: "face.png", url: PIXEL }),
    );
  });

  it("are found by their escaped address in a project's page", () => {
    const spec: Spec = {
      name: "chinrest",
      assets: [card],
      timeline: [{ kind: "trial", plugin: "virtual-chinrest", params: { item_path: card.name } }],
    };
    const { source } = compileSpec(spec, schemas, { assets: "files" });
    expect(source).toContain('"bank card (1).png": "assets/bank%20card%20%281%29.png"');
  });
});

describe("lists of files", () => {
  const video = { name: "clip.webm", url: "data:video/webm;base64,AAAA" };
  const image = { name: "square.png", url: "data:image/png;base64,AAAA" };
  const slider = (stimulus: unknown, extra: Partial<Spec> = {}): Spec => ({
    name: "videos",
    assets: [video, image],
    timeline: [
      {
        kind: "trial",
        plugin: "video-slider-response",
        params: { stimulus } as TrialNode["params"],
      },
    ],
    ...extra,
  });

  it("makes a list of the one file a column names", () => {
    const spec: Spec = {
      ...slider({ var: "video" }),
      conditions: { videos: [{ video: "clip.webm" }] },
    };
    spec.timeline = [{ kind: "block", conditions: "videos", children: spec.timeline }];
    const { source } = compileSpec(spec, schemas);
    expect(source).toContain(
      'stimulus: () => asset([].concat(jsPsych.evaluateTimelineVariable("video")))',
    );
  });

  it("rejects a single file where a list of them belongs", () => {
    expect(() => compileSpec(slider("clip.webm"), schemas)).toThrow(
      /parameter "stimulus" expects a list of files/,
    );
  });

  it("rejects a file of the wrong kind", () => {
    expect(() => compileSpec(slider(["square.png"]), schemas)).toThrow(
      /names "square.png", which is an image, where a video belongs/,
    );
  });

  it.each([[[""]], [[]]])("rejects a required list with no file chosen: %j", (stimulus) => {
    expect(() => compileSpec(slider(stimulus), schemas)).toThrow(
      /requires a file for parameter "stimulus"/,
    );
  });

  it("turns an embedded video into a blob URL when the page starts", () => {
    const { source } = compileSpec(slider(["clip.webm"]), schemas);
    expect(source).toContain("URL.createObjectURL(");
    const { source: files } = compileSpec(slider(["clip.webm"]), schemas, { assets: "files" });
    expect(files).not.toContain("URL.createObjectURL(");
  });
});

describe("lists that are not files", () => {
  it("makes a list of the one label a column holds", () => {
    const { source } = compileSpec(
      {
        name: "labels",
        conditions: { rows: [{ label: "sure" }] },
        timeline: [
          {
            kind: "block",
            conditions: "rows",
            children: [
              {
                kind: "trial",
                plugin: "html-slider-response",
                params: { stimulus: "<p>hi</p>", labels: { var: "label" } },
              },
            ],
          },
        ],
      },
      schemas,
    );
    expect(source).toContain('labels: () => [].concat(jsPsych.evaluateTimelineVariable("label"))');
  });

  it("leaves a key list read from a column alone, since it may be ALL_KEYS", () => {
    const { source } = compileSpec(
      {
        name: "keys",
        conditions: { rows: [{ keys: "ALL_KEYS" }] },
        timeline: [
          {
            kind: "block",
            conditions: "rows",
            children: [
              {
                kind: "trial",
                plugin: "html-keyboard-response",
                params: { stimulus: "<p>hi</p>", choices: { var: "keys" } },
              },
            ],
          },
        ],
      },
      schemas,
    );
    expect(source).toContain('choices: jsPsych.timelineVariable("keys")');
  });
});

describe("files in the data", () => {
  const showing = (assets: Asset[]): Spec => ({
    name: "files",
    assets,
    timeline: [
      {
        kind: "trial",
        plugin: "image-keyboard-response",
        params: { stimulus: assets.length > 0 ? "face.png" : "https://example.com/face.png" },
      },
    ],
  });

  it("puts back each file's name in every row of a study with files", () => {
    const { source } = compileSpec(
      showing([{ name: "face.png", url: "data:image/png;base64,AA==" }]),
      schemas,
    );
    expect(source).toContain("on_data_update: (row) =>");
    expect(source).toContain("const fileNames = new Map(");
  });

  it("leaves the data of a study without files alone", () => {
    const { source } = compileSpec(showing([]), schemas);
    expect(source).not.toContain("on_data_update");
  });
});
