import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileSpec } from "../src/compile.ts";
import {
  filesOfPackages,
  packageFileKey,
  thirdPartyComment,
  thirdPartyNotice,
  type PackageFile,
} from "../src/package-files.ts";
import {
  assertFitsInOnePage,
  breaksOut,
  emitHtml,
  filesLoadedWhileRunning,
} from "../src/targets/html.ts";
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
  it("names the same files whether or not the folder is written with a closing slash", async () => {
    const compiled = compileSpec(plain, schemas);
    const { html: bare } = await emitHtml(compiled, { title: "p", base: "./lib" });
    const { html: slashed } = await emitHtml(compiled, { title: "p", base: "./lib/" });
    expect(slashed).toBe(bare);
  });

  it("names each file inside the folder, unchecked", async () => {
    const { html } = await emitHtml(compileSpec(plain, schemas), { title: "plain", base: "./lib" });
    expect(html).toContain('<link rel="stylesheet" href="./lib/jspsych/css/jspsych.css" />');
    expect(html).toContain('<script src="./lib/jspsych/dist/index.browser.min.js"></script>');
    expect(html).not.toContain("unpkg.com");
    expect(html).not.toContain("integrity=");
  });
});

describe("a page that carries its files inside it", () => {
  it("says at its top which packages it carries, under which licence", async () => {
    const { html } = await emitHtml(compileSpec(plain, schemas), {
      title: "plain",
      inline: copiesOf(plain),
    });
    const head = html.slice(0, html.indexOf("<title>"));
    expect(head).toContain("This page carries unchanged copies of these packages");
    expect(head).toContain(
      `jspsych ${schemas.jspsych}, MIT, https://github.com/jspsych/jsPsych/tree/HEAD/packages/jspsych`,
    );
  });

  it("writes every file into the page and links nothing", async () => {
    const { html } = await emitHtml(compileSpec(plain, schemas), {
      title: "plain",
      inline: copiesOf(plain),
    });
    expect(html).not.toMatch(/\bsrc="|<link /);
    expect(html).toContain("<style>\n/* jspsych/css/jspsych.css */\n</style>");
    expect(html).toContain("<script>\n/* jspsych/dist/index.browser.min.js */\n</script>");
  });

  it.each([
    ["a closing script tag", 'const tag = "</script>";'],
    ["an opening script tag", 'const tag = "<SCRIPT>";'],
    ["the start of a comment", "const c = '<!--';"],
  ])("refuses a file holding %s, rather than changing what it does", async (_what, text) => {
    const copies = { ...copiesOf(plain), "jspsych/dist/index.browser.min.js": text };
    await expect(
      emitHtml(compileSpec(plain, schemas), { title: "p", inline: copies }),
    ).rejects.toThrow(
      /jspsych\/dist\/index\.browser\.min\.js holds .*, so it cannot be written safely into the page/,
    );
  });

  it("leaves a script alone that only builds a closing style tag into its markup", async () => {
    const copies = {
      ...copiesOf(plain),
      "jspsych/dist/index.browser.min.js": 'html += "</style>";',
    };
    const { html } = await emitHtml(compileSpec(plain, schemas), { title: "p", inline: copies });
    expect(html).toContain('<script>\nhtml += "</style>";\n</script>');
  });

  it("refuses a stylesheet that would end its style element", async () => {
    const copies = { ...copiesOf(plain), "jspsych/css/jspsych.css": "/* </STYLE> */" };
    await expect(
      emitHtml(compileSpec(plain, schemas), { title: "p", inline: copies }),
    ).rejects.toThrow(/jspsych\/css\/jspsych\.css holds "<\/STYLE"/);
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
    const files = await projectFiles(plain, schemas, {
      packageSources: () => Promise.resolve(copiesOf(plain)),
    });
    expect(files["lib/jspsych/dist/index.browser.min.js"]).toBe(
      "/* jspsych/dist/index.browser.min.js */",
    );
    expect(files["index.html"]).toContain('src="./lib/jspsych/dist/index.browser.min.js"');
    expect(files["index.html"]).not.toContain("unpkg.com");
    expect(files["README.md"]).toContain("`lib/` — jsPsych and the plugins this study uses");
    expect(files["README.md"]).toContain("so it runs without internet");
  });

  it("lists what it carries, with each licence and source, beside the copies", async () => {
    const files = await projectFiles(tracking, schemas, {
      packageSources: () => Promise.resolve(copiesOf(tracking)),
    });
    const notice = files["lib/THIRD-PARTY.md"] as string;
    expect(notice).toContain(`| jspsych | ${schemas.jspsych} | MIT |`);
    expect(notice).toMatch(
      /\| webgazer \| [\d.]+ \| GPL-3\.0-or-later \| https:\/\/github\.com\/brownhci\/WebGazer \|/,
    );
    expect(files["README.md"]).toContain("`lib/THIRD-PARTY.md` lists them with their licences");
  });

  it("carries the eye tracker's model, and says to serve the folder to try it", async () => {
    const files = await projectFiles(tracking, schemas, {
      packageSources: () => Promise.resolve(copiesOf(tracking)),
    });
    expect(
      Object.keys(files).some((path) => path.startsWith("lib/webgazer/dist/mediapipe/face_mesh/")),
    ).toBe(true);
    expect(files["README.md"]).toContain("python3 -m http.server");
  });

  it("names every file it was not given a copy of", async () => {
    const copies = copiesOf(plain);
    delete copies["jspsych/css/jspsych.css"];
    await expect(
      projectFiles(plain, schemas, { packageSources: () => Promise.resolve(copies) }),
    ).rejects.toThrow(/no copy of jspsych\/css\/jspsych\.css to carry/);
  });

  it("says where jsPsych loads from when it carries no copies", async () => {
    const files = await projectFiles(plain, schemas);
    expect(Object.keys(files).some((path) => path.startsWith("lib/"))).toBe(false);
    expect(files["README.md"]).toContain("load from unpkg.com");
  });
});

describe("the notice of what a download carries", () => {
  const file = (
    name: string,
    path: string,
    source = `https://example.org/${name}`,
  ): PackageFile => ({
    package: name,
    version: "1.0.0",
    path,
    integrity: "sha384-x",
    license: "MIT",
    source,
  });

  it("names each package once, however many of its files are carried", () => {
    const notice = thirdPartyNotice([file("a", "one.js"), file("a", "two.js"), file("b", "b.js")]);
    expect(notice.match(/^\| a \|/gm)).toHaveLength(1);
    expect(notice.match(/^\| b \|/gm)).toHaveLength(1);
  });

  it("credits a package built into another's files, named as inside it", () => {
    const firebase = {
      package: "firebase",
      version: "12.0.0",
      license: "Apache-2.0",
      source: "https://github.com/firebase/firebase-js-sdk",
    };
    const files = [{ ...file("a", "a.js"), bundles: [firebase] }, file("b", "b.js")];
    const notice = thirdPartyNotice(files);
    expect(notice).toContain(
      "| a | 1.0.0 | MIT | https://example.org/a |\n" +
        "| firebase (inside a) | 12.0.0 | Apache-2.0 | https://github.com/firebase/firebase-js-sdk |\n" +
        "| b |",
    );
    expect(thirdPartyComment(files)).toContain(
      "firebase (inside a) 12.0.0, Apache-2.0, https://github.com/firebase/firebase-js-sdk",
    );
  });

  it("keeps a bar in a package's details from breaking its row of the table", () => {
    const notice = thirdPartyNotice([{ ...file("a", "a.js"), license: "MIT|Apache" }]);
    expect(notice).toContain("| a | 1.0.0 | MIT\\|Apache | https://example.org/a |");
  });

  it("keeps a backslash before a bar from undoing the bar's escape", () => {
    const notice = thirdPartyNotice([{ ...file("a", "a.js"), license: "MIT\\|x" }]);
    expect(notice).toContain("| MIT\\\\\\|x |");
  });

  it("cannot end the comment it is written in early", () => {
    const comment = thirdPartyComment([file("a", "a.js", "https://example.org/a--->b---")]);
    expect(comment.slice(4, -3)).not.toContain("--");
    expect(comment.endsWith("-->")).toBe(true);
  });
});

describe("the scripts and stylesheets Tachisto can carry in a page", () => {
  const nodeModules = join(import.meta.dirname, "..", "..", "..", "node_modules");
  const pageFiles = (writable: boolean) =>
    Object.entries(schemas.packages).flatMap(([name, { files, breaksOutOfPage = [] }]) =>
      Object.keys(files)
        .filter((path) => /\.(js|css)$/.test(path) && !path.includes("/mediapipe/"))
        .filter((path) => breaksOutOfPage.includes(path) !== writable)
        .map((path) => `${name}/${path}`),
    );

  // Each file is checked when the bundle is built; this says so again from the installed copy.
  it.each(pageFiles(true))("%s can be written into a page as it is", (key) => {
    const element = key.endsWith(".css") ? "style" : "script";
    expect(breaksOut(readFileSync(join(nodeModules, key), "utf8"), element)).toBeNull();
  });

  it("knows the DataPipe extension, whose Firebase builds a script tag, cannot be", () => {
    expect(pageFiles(false)).toEqual(["@jspsych/extension-pipe/dist/index.browser.min.js"]);
  });

  it("refuses one page to a study that loads a file which cannot be written into it", () => {
    const compiled = compileSpec(plain, schemas);
    const [first, ...rest] = compiled.files;
    expect(() =>
      assertFitsInOnePage({
        ...compiled,
        files: [{ ...first, breaksOutOfPage: true }, ...rest],
      }),
    ).toThrow(/jspsych\/.* cannot be written into a page as it is.*download the project folder/);
    expect(() => assertFitsInOnePage(compiled)).not.toThrow();
  });
});
