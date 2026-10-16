# jspsych-studio

A no-code builder for [jsPsych](https://www.jspsych.org) experiments. Researchers assemble a study
in a UI; the tool compiles it to readable, correct jsPsych source they can host anywhere.

**Status: early.** You can build a flanker task end to end in the browser — nested timeline,
conditions table generated from a design, generated parameter forms (questionnaire items
included), rich stimulus text, image and sound files, group assignment and branching on
performance, a psychophysics canvas step whose objects you drag into place, live preview of the
whole experiment or a single step, a choice of where results go, a guided tour of the builder,
and export to a self-contained HTML file or a zipped project. There is no hosting or study-level
flow, and no release has been cut.

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
| `@jspsych-studio/schemas`  | Turns every plugin's `info.parameters` plus the JSDoc in its shipped `.d.ts` into JSON Schema, so the builder's forms are generated rather than hand-written |
| `@jspsych-studio/compiler` | Compiles a declarative spec to jsPsych source and emits a self-contained HTML experiment                                                                     |

## Use

```sh
npm install
npm run dev              # the builder at http://localhost:5180
npm test                 # unit tests plus two real-browser end-to-end runs
npm run typecheck
npm run schemas          # regenerate packages/schemas/plugin-schemas.json, print coverage
npm run spec-schema      # regenerate packages/compiler/spec-schema.json
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

## Editing a spec by hand

Every spec names a JSON Schema in `$schema`, so a spec file opened in VS Code, Positron or any
other editor with a JSON language server gets completion, hover documentation and validation —
including each plugin's own parameters and the JSDoc describing them, since the schema is built
from the same extraction that drives the builder's forms. The builder writes `$schema` into
everything it exports, so a downloaded spec is ready to edit before anything is installed.

`npm run spec-schema` regenerates `packages/compiler/spec-schema.json`, which the Pages deploy
serves alongside the builder.

The schema encodes the structural rules — which step kinds exist, what each one requires, that a
parameter may hold a `{ "var": "column" }` reference anywhere a literal is allowed, that uploading
data needs an experiment id. The rules that need the whole spec at once, such as whether a
referenced conditions column actually exists upstream of the step reading it, stay in the
compiler's validator; the schema narrows what reaches it rather than replacing it.

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
