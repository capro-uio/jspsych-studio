import { literal } from "./emit.ts";
import type { Asset } from "./types.ts";

const PRELOAD_PLUGIN = "preload";

// Media is addressed by name everywhere in a spec — in a parameter, or in a conditions column —
// and resolved through this map at run time, so a conditions table can hold plain file names.
export function compileAssetMap(assets: Asset[]) {
  const entries = assets.map((asset) => `  ${literal(asset.name)}: ${literal(asset.url)}`);
  return (
    `const assets = {\n${entries.join(",\n")}\n};\n` +
    `const asset = (name) => assets[name] ?? name;\n`
  );
}

export function compilePreloadStep(assets: Asset[]) {
  return {
    plugin: PRELOAD_PLUGIN,
    source:
      `{\n  type: jsPsychPreload,\n` +
      `  auto_preload: true,\n` +
      `  images: Object.values(assets),\n` +
      `}`,
  };
}

export function assetNames(assets: Asset[] | undefined) {
  return new Set((assets ?? []).map((asset) => asset.name));
}
