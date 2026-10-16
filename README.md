# jspsych-studio

A no-code builder for [jsPsych](https://www.jspsych.org) experiments. Researchers assemble a study
in a UI; the tool compiles it to readable, correct jsPsych source they can host anywhere.

**Status: early.** You can build a flanker task end to end in the browser — nested timeline,
conditions table, generated parameter forms, image and sound files, live preview of the real
experiment, a choice of where results go, and export to a self-contained HTML file. There is no hosting, survey editor, or
study-level flow yet.

**Try it:** <https://www.capro.dev/jspsych-studio/> — nothing to install, and the examples
open a working experiment in one click.

## Why

jsPsych requires JavaScript, which most psychologists do not write. The alternatives are
pay-per-participant platforms or a Python toolchain with a lossy JavaScript export. More
importantly, hand-written jsPsych fails _silently_: the published community flanker timeline
renders one stimulus for every condition because it reads timeline variables the wrong way, with no
console error. A compiler encodes those rules once.

The design rests on one observation: jsPsych plugins describe their own parameters at runtime, and
the JSDoc for each parameter survives in the published type declarations — so the form UI for the
whole plugin ecosystem can be generated instead of hand-written, which is what makes this
maintainable by a small team.

## Packages

| Package                    | What it does                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@jspsych-studio/schemas`  | Turns every plugin's `info.parameters` plus the JSDoc in its shipped `.d.ts` into JSON Schema, so the eventual form UI is generated rather than hand-written |
| `@jspsych-studio/compiler` | Compiles a declarative spec to jsPsych source and emits a self-contained HTML experiment                                                                     |

## Use

```sh
npm install
npm run dev              # the builder at http://localhost:5180
npm test                 # unit tests plus two real-browser end-to-end runs
npm run typecheck
npm run schemas          # regenerate packages/schemas/plugin-schemas.json, print coverage
node --experimental-strip-types packages/compiler/src/cli.ts compile examples/flanker.json
```

The acceptance test for the UI builds `examples/flanker.json` by clicking through the app and
asserts the authored spec matches the reference file, then checks the preview actually runs.

`examples/flanker.json` is the reference spec: instructions, then a practice block over a
four-row conditions table, randomised, twice through, scored against a correct-key column, repeating
while cumulative accuracy stays below 0.75.

`examples/shapes.json` is the image example: four PNGs (blue and orange squares and circles) carried
in the spec as data URLs, named from a conditions column, preloaded, and judged on shape while
colour is recorded but irrelevant.

## Design rules

- **One-way compile.** The spec compiles to JavaScript; JavaScript is never parsed back.
- **Generated forms.** No per-plugin UI code — ~115 plugins would bury a single maintainer.
- **No backend.** Static tool. Results go to DataPipe or any compatible service, and a failed
  upload falls back to a download so a participant's data is never lost silently. Balanced group
  assignment asks that same service for the next group, since only it can count participants.
- **Self-contained exports.** Media is embedded in the project and in the exported file, so an
  experiment is one HTML file with nothing to upload alongside it (files are capped at 5 MB each).
- **Readable output.** The generated file is something a researcher can read, host, and hand to a
  collaborator. The builder shows the generated code as you edit.
- **Browser-safe core.** Everything in `packages/compiler/src` except `cli.ts` must run in the
  browser, because the preview compiles there. A test enforces it.
- **Versioned provenance.** Exports say what made them: the Psych-DS `isBasedOn`, the header
  comment in `experiment.js`, the `generator` meta tag and the project readme all name Studio and
  jsPsych with their versions. Studio's comes from `packages/compiler/package.json`, so a release
  is a version bump and nothing else — `npm version <v> --workspaces` turns it on everywhere.
  While the workspaces sit at `0.0.0` no Studio version is claimed, because a dataset built by
  "jsPsych Studio 0.0.0" names a build nobody can obtain.

## License

MIT — see [LICENSE](LICENSE). Experiments you build with it are yours, under whatever terms you
like; nothing Studio generates carries this licence onward.

The repository also ships jsPsych's own documentation text inside
`packages/schemas/plugin-schemas.json`, which is MIT licensed too. See
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
