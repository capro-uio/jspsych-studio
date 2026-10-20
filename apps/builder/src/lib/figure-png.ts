/** Larger canvases than this are refused by some browsers, Safari among them. */
const MAX_PIXELS = 16_000_000;

/**
 * A PNG of an SVG figure at a given width, drawn by the browser, and smaller than asked if that
 * would make a canvas larger than browsers allow. The SVG is given its size in pixels first, so
 * the vector is drawn at the size wanted rather than at its printed size and stretched. Fonts the
 * figure names but the browser does not have fall back to the ones listed after them.
 */
export async function figurePng(figure: string, wantedWidth: number): Promise<Blob> {
  const parsed = new DOMParser().parseFromString(figure, "image/svg+xml");
  const root = parsed.documentElement;
  const [, , width, height] = (root.getAttribute("viewBox") ?? "").split(" ").map(Number);
  const shrink = Math.min(
    1,
    Math.sqrt(MAX_PIXELS / (wantedWidth * ((wantedWidth * height) / width))),
  );
  const pixelWidth = Math.floor(wantedWidth * shrink);
  const pixelHeight = Math.round((height * pixelWidth) / width);
  root.setAttribute("width", String(pixelWidth));
  root.setAttribute("height", String(pixelHeight));
  const svg = new XMLSerializer().serializeToString(parsed);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("this browser cannot draw the figure");
    context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("no PNG was made"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
