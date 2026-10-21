import { download } from "./files.ts";
import type { FigureFormat } from "./figure-choices.svelte.ts";

/** Saves a figure in the format chosen: its SVG as it is, or a PNG drawn from it at the width given. */
export async function saveFigure(
  name: string,
  svg: string,
  pixelWidth: number,
  format: FigureFormat,
) {
  if (format === "svg") {
    download(`${name}.svg`, svg, "image/svg+xml");
    return;
  }
  const { figurePng } = await import("./figure-png.ts");
  download(`${name}.png`, await figurePng(svg, pixelWidth), "image/png");
}
