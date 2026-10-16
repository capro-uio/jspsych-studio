import { literal } from "./emit.ts";
import type { Asset } from "./types.ts";

const PRELOAD_PLUGIN = "preload";

const MEDIA_TYPES = new Set(["IMAGE", "AUDIO", "VIDEO"]);

// jsPsych types preload's file lists as plain strings rather than media, so they are named here.
// Both the compiler and the validator read this, so the two cannot disagree about what is a file.
const MEDIA_PARAMETERS: Record<string, Set<string>> = {
  [PRELOAD_PLUGIN]: new Set(["images", "audio", "video"]),
};

export function isMediaType(jspsychType?: string) {
  return jspsychType !== undefined && MEDIA_TYPES.has(jspsychType);
}

export function isMediaParameter(plugin: string, parameter: string, jspsychType?: string) {
  if (isMediaType(jspsychType)) return true;
  return MEDIA_PARAMETERS[plugin]?.has(parameter) ?? false;
}

// Media is addressed by name everywhere in a spec — in a parameter, or in a conditions column —
// and resolved through this map at run time, so a conditions table can hold plain file names.
export const ASSET_DIRECTORY = "assets";

export function assetPath(asset: Asset) {
  return `${ASSET_DIRECTORY}/${asset.name}`;
}

export function compileAssetMap(assets: Asset[], mode: "inline" | "files" = "inline") {
  const entries = assets.map(
    (asset) =>
      `  ${literal(asset.name)}: ${literal(mode === "files" ? assetPath(asset) : asset.url)}`,
  );
  return (
    `const assets = {\n${entries.join(",\n")}\n};\n` +
    `const asset = (name) => assets[name] ?? name;\n`
  );
}

export function compilePreloadStep() {
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
