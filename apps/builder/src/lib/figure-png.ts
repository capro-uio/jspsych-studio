/**
 * A PNG of an SVG figure at a given width, drawn by the browser. Fonts the figure names but the
 * browser does not have fall back to the ones listed after them, as they would in any viewer.
 */
export async function figurePng(svg: string, pixelWidth: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = Math.round((image.naturalHeight * pixelWidth) / image.naturalWidth);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("this browser cannot draw the figure");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
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
