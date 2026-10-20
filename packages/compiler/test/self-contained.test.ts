import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import { filesOfPackages, packageFileKey } from "../src/package-files.ts";
import { emitHtml, filesLoadedWhileRunning } from "../src/targets/html.ts";
import { projectFiles } from "../src/targets/project.ts";
import type { Spec, SpecNode } from "../src/types.ts";
import { schemas } from "./schemas.ts";

const keyTrial: SpecNode = {
  kind: "trial",
  plugin: "html-keyboard-response",
  params: { stimulus: "<p>hi</p>" },
};
const plain: Spec = { name: "plain", timeline: [keyTrial] };
const tracking: Spec = {
  name: "tracking",
  timeline: [
    { kind: "trial", plugin: "webgazer-init-camera" },
    { kind: "trial", plugin: "webgazer-calibrate" },
    keyTrial,
  ],
};

/** A stand-in copy of every file a study loads, each saying which file it is. */
function copiesOf(spec: Spec) {
  return Object.fromEntries(
    compileSpec(spec, schemas).files.map((file) => [
      packageFileKey(file),
      `/* ${packageFileKey(file)} */`,
    ]),
  );
}

describe("filesOfPackages", () => {
  const jspsych = { name: "jspsych", version: schemas.jspsych };

  it("lists each file the bundle records for a package, with its hash, once", () => {
    const files = filesOfPackages(schemas, [jspsych, jspsych]);
    expect(files.map((file) => file.path)).toEqual(Object.keys(schemas.packages.jspsych.files));
    for (const file of files) {
      expect(file).toMatchObject({ package: "jspsych", version: schemas.jspsych });
      expect(file.integrity).toBe(schemas.packages.jspsych.files[file.path]);
    }
  });

  it("refuses a package the bundle records no files for", () => {
    expect(() => filesOfPackages(schemas, [{ name: "left-pad", version: "1.0.0" }])).toThrow(
      /records no files for left-pad/,
    );
  });

  it("refuses a package recorded at another version, so an old copy is never carried", () => {
    expect(() => filesOfPackages(schemas, [{ ...jspsych, version: "7.0.0" }])).toThrow(
      /records jspsych .*, but the study uses 7\.0\.0/,
    );
  });
});

describe("the files a compiled study loads", () => {
  it("are jsPsych, its stylesheet and each plugin the study uses", () => {
    const keys = compileSpec(plain, schemas).files.map(packageFileKey);
    expect(keys.sort()).toEqual([
      "@jspsych/plugin-html-keyboard-response/dist/index.browser.min.js",
      "jspsych/css/jspsych.css",
      "jspsych/dist/index.browser.min.js",
    ]);
    expect(filesLoadedWhileRunning(compileSpec(plain, schemas))).toEqual([]);
  });

  it("include the eye tracker and the model it loads while it runs", () => {
    const compiled = compileSpec(tracking, schemas);
    const keys = compiled.files.map(packageFileKey);
    expect(keys).toContain("webgazer/dist/webgazer.js");
    expect(keys).toContain("@jspsych/extension-webgazer/dist/index.browser.min.js");
    const loadedLater = filesLoadedWhileRunning(compiled).map((file) => file.path);
    expect(loadedLater.length).toBeGreaterThan(0);
    expect(loadedLater.every((path) => path.startsWith("dist/mediapipe/face_mesh/"))).toBe(true);
  });
});

describe("a page that loads from unpkg", () => {
  it("checks every file it loads against the hash recorded for it", async () => {
    const compiled = compileSpec(plain, schemas);
    const { html } = await emitHtml(compiled, { title: "plain" });
    for (const file of compiled.files) {
      const url = `https://unpkg.com/${file.package}@${file.version}/${file.path}`;
      expect(html).toContain(`"${url}" integrity="${file.integrity}" crossorigin="anonymous"`);
    }
  });
});

describe("a page that loads from a folder beside it", () => {
  it("names each file inside the folder, unchecked", async () => {
    const { html } = await emitHtml(compileSpec(plain, schemas), { title: "plain", base: "./lib" });
    expect(html).toContain('<link rel="stylesheet" href="./lib/jspsych/css/jspsych.css" />');
    expect(html).toContain('<script src="./lib/jspsych/dist/index.browser.min.js"></script>');
    expect(html).not.toContain("unpkg.com");
    expect(html).not.toContain("integrity=");
  });
});

describe("a page that carries its files inside it", () => {
  it("writes every file into the page and links nothing", async () => {
    const { html } = await emitHtml(compileSpec(plain, schemas), {
      title: "plain",
      inline: copiesOf(plain),
    });
    expect(html).not.toMatch(/\bsrc="|<link /);
    expect(html).toContain("<style>\n/* jspsych/css/jspsych.css */\n</style>");
    expect(html).toContain("<script>\n/* jspsych/dist/index.browser.min.js */\n</script>");
  });

  it("keeps a closing tag inside a file from ending the element it is written in", async () => {
    const copies = copiesOf(plain);
    copies["jspsych/dist/index.browser.min.js"] = 'const tag = "</script><!--";';
    copies["jspsych/css/jspsych.css"] = "/* </STYLE> */";
    const { html } = await emitHtml(compileSpec(plain, schemas), { title: "p", inline: copies });
    expect(html).toContain('const tag = "<\\/script><\\!--";');
    expect(html).toContain("/* <\\/STYLE> */");
  });

  it("says which file it has no copy of", async () => {
    const copies = copiesOf(plain);
    delete copies["jspsych/css/jspsych.css"];
    await expect(
      emitHtml(compileSpec(plain, schemas), { title: "p", inline: copies }),
    ).rejects.toThrow(/no copy of jspsych\/css\/jspsych\.css/);
  });

  it("refuses a study that loads files while it runs, and points to the folder download", async () => {
    await expect(
      emitHtml(compileSpec(tracking, schemas), { title: "t", inline: copiesOf(tracking) }),
    ).rejects.toThrow(/cannot be carried in one page; download the project folder/);
  });
});

describe("a project download that carries its files", () => {
  it("puts each file under lib/ and loads it from there", async () => {
    const files = await projectFiles(plain, schemas, { packageSources: copiesOf(plain) });
    expect(files["lib/jspsych/dist/index.browser.min.js"]).toBe(
      "/* jspsych/dist/index.browser.min.js */",
    );
    expect(files["index.html"]).toContain('src="./lib/jspsych/dist/index.browser.min.js"');
    expect(files["index.html"]).not.toContain("unpkg.com");
    expect(files["README.md"]).toContain("`lib/` — jsPsych and the plugins this study uses");
    expect(files["README.md"]).toContain("so it runs without internet");
  });

  it("carries the eye tracker's model, and says to serve the folder to try it", async () => {
    const files = await projectFiles(tracking, schemas, { packageSources: copiesOf(tracking) });
    expect(
      Object.keys(files).some((path) => path.startsWith("lib/webgazer/dist/mediapipe/face_mesh/")),
    ).toBe(true);
    expect(files["README.md"]).toContain("python3 -m http.server");
  });

  it("names every file it was not given a copy of", async () => {
    const copies = copiesOf(plain);
    delete copies["jspsych/css/jspsych.css"];
    await expect(projectFiles(plain, schemas, { packageSources: copies })).rejects.toThrow(
      /no copy of jspsych\/css\/jspsych\.css to carry/,
    );
  });

  it("says where jsPsych loads from when it carries no copies", async () => {
    const files = await projectFiles(plain, schemas);
    expect(Object.keys(files).some((path) => path.startsWith("lib/"))).toBe(false);
    expect(files["README.md"]).toContain("load from unpkg.com");
  });
});
