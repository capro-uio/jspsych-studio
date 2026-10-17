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

export type PreloadList = "images" | "audio" | "video";

const MEDIA_TYPE_OF_LIST: Record<PreloadList, string> = {
  images: "image",
  audio: "audio",
  video: "video",
};

const EXTENSIONS_OF_LIST: Record<PreloadList, string[]> = {
  images: ["apng", "avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"],
  audio: ["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "weba"],
  video: ["m4v", "mov", "mp4", "ogv", "webm"],
};

const PRELOAD_LISTS = Object.keys(MEDIA_TYPE_OF_LIST) as PreloadList[];

/**
 * Which of the preload plugin's lists a file belongs in, from the media type its data URL carries,
 * or else its extension; `null` for a file that is not an image, a sound or a video.
 */
export function preloadListOf(asset: Asset): PreloadList | null {
  const mediaType = /^data:([a-z]+)\//i.exec(asset.url)?.[1].toLowerCase();
  const extension = /\.([a-z0-9]+)$/i.exec(asset.name)?.[1].toLowerCase() ?? "";
  const matches = (list: PreloadList) =>
    mediaType
      ? MEDIA_TYPE_OF_LIST[list] === mediaType
      : EXTENSIONS_OF_LIST[list].includes(extension);
  return PRELOAD_LISTS.find(matches) ?? null;
}

// The preload plugin loads each list its own way; a sound in `images` fails to load as a picture,
// and the plugin then stops the study.
export function compilePreloadStep(assets: Asset[]) {
  const lists = PRELOAD_LISTS.map((list) => {
    const names = assets
      .filter((asset) => preloadListOf(asset) === list)
      .map((asset) => asset.name);
    return names.length > 0
      ? `  ${list}: [${names.map((name) => `assets[${literal(name)}]`).join(", ")}],\n`
      : "";
  }).join("");
  if (!lists) return null;
  return {
    plugin: PRELOAD_PLUGIN,
    source: `{\n  type: jsPsychPreload,\n  auto_preload: true,\n${lists}}`,
  };
}

export function assetNames(assets: Asset[] | undefined) {
  return new Set((assets ?? []).map((asset) => asset.name));
}
