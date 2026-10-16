import type { Spec } from "@jspsych-studio/compiler";

export function download(filename: string, contents: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

export function specFilename(spec: Spec) {
  return spec.name.trim() || "experiment";
}
