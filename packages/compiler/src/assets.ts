import { literal } from "./emit.ts";
import type { Asset } from "./types.ts";

const PRELOAD_PLUGIN = "preload";

export type PreloadList = "images" | "audio" | "video";

const LIST_OF_JSPSYCH_TYPE: Record<string, PreloadList> = {
  IMAGE: "images",
  AUDIO: "audio",
  VIDEO: "video",
};

// jsPsych types preload's file lists as plain strings rather than media, so they are named here.
// Both the compiler and the validator read this, so the two cannot disagree about what is a file.
const MEDIA_PARAMETERS: Record<string, Set<string>> = {
  [PRELOAD_PLUGIN]: new Set(["images", "audio", "video"]),
};

export function isMediaType(jspsychType?: string) {
  return jspsychType !== undefined && jspsychType in LIST_OF_JSPSYCH_TYPE;
}

/** The kind of file a media parameter takes: preload's lists are named for theirs. */
export function mediaListOf(plugin: string, parameter: string, jspsychType?: string) {
  if (jspsychType !== undefined && jspsychType in LIST_OF_JSPSYCH_TYPE) {
    return LIST_OF_JSPSYCH_TYPE[jspsychType];
  }
  return MEDIA_PARAMETERS[plugin]?.has(parameter) ? (parameter as PreloadList) : null;
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

// A plugin may write a file's address into CSS without quotes, as the viewing-distance check
// does its card, where a space or a bracket ends the address. Escaped, the address still names
// the same file, and has none of either.
const escapeCharacter = (character: string) =>
  `%${character.charCodeAt(0).toString(16).toUpperCase()}`;

/** Where the page finds a file beside it, escaped so it reads the same wherever it is written. */
export function assetAddress(asset: Asset) {
  return assetPath(asset)
    .split("/")
    .map((part) => encodeURIComponent(part).replace(/[!'()*]/g, escapeCharacter))
    .join("/");
}

// jsPsych's video plugins read a video's type from the end of its address, which a data URL does
// not have, and a page opened from disk does not preload videos into playable copies. So an
// embedded video is turned into a blob URL, which plays from wherever the page was opened.
const VIDEO_BLOBS = `for (const [name, url] of Object.entries(assets)) {
  const [header, data] = url.split(",");
  if (!header.startsWith("data:video/") || !header.endsWith(";base64")) continue;
  const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
  assets[name] = URL.createObjectURL(new Blob([bytes], { type: header.slice(5, -";base64".length) }));
}
`;

// A plugin records the file it showed as the address it was given, which for an embedded file is
// the whole file as a data URL, in every row, every frame of an animation and every move of a free
// sort. Each row has those addresses put back to the file names a spec uses.
const FILE_NAMES = `const fileNames = new Map(Object.entries(assets).map(([name, url]) => [url, name]));
const named = (value) =>
  typeof value === "string"
    ? (fileNames.get(value) ?? value)
    : Array.isArray(value)
      ? value.map(named)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, named(entry)]))
        : value;
`;

/** Puts back the names of files a row of data holds by address; the row is jsPsych's own. */
export const NAME_FILES_IN_DATA =
  "on_data_update: (row) => { for (const [column, value] of Object.entries(row)) row[column] = named(value); }";

export function compileAssetMap(assets: Asset[], mode: "inline" | "files" = "inline") {
  const entries = assets.map(
    (asset) =>
      `  ${literal(asset.name)}: ${literal(mode === "files" ? assetAddress(asset) : asset.url)}`,
  );
  const embedsVideo =
    mode === "inline" && assets.some((asset) => asset.url.startsWith("data:video/"));
  return (
    `const assets = {\n${entries.join(",\n")}\n};\n` +
    (embedsVideo ? VIDEO_BLOBS : "") +
    `const asset = (name) => (Array.isArray(name) ? name.map(asset) : (assets[name] ?? name));\n` +
    FILE_NAMES
  );
}

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
 * or else its extension, since a browser that does not know a file's type labels it
 * application/octet-stream; `null` for a file that is not an image, a sound or a video.
 */
export function preloadListOf(asset: Asset): PreloadList | null {
  const mediaType = /^data:([a-z]+)\//i.exec(asset.url)?.[1].toLowerCase();
  const extension = /\.([a-z0-9]+)$/i.exec(asset.name)?.[1].toLowerCase() ?? "";
  return (
    PRELOAD_LISTS.find((list) => MEDIA_TYPE_OF_LIST[list] === mediaType) ??
    PRELOAD_LISTS.find((list) => EXTENSIONS_OF_LIST[list].includes(extension)) ??
    null
  );
}

/** The added files a media parameter of this jsPsych type can show or play. */
export function assetsOfType(assets: Asset[], jspsychType: string) {
  const list = LIST_OF_JSPSYCH_TYPE[jspsychType];
  return list ? assets.filter((asset) => preloadListOf(asset) === list) : [];
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
