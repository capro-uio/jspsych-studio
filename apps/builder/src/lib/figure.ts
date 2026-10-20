import tokens from "@tachisto/brand/tokens.json" with { type: "json" };
import { escapeHtmlText } from "@tachisto/compiler";

const LIGHT_INKS = new Map(tokens.color.tokens.map((token) => [token.name, token.value.light]));

/** A brand colour in its light ink, which figures for print always use. */
export function ink(name: string) {
  const colour = LIGHT_INKS.get(name);
  if (!colour) throw new Error(`no brand colour named ${name}`);
  return colour;
}

const FONT = "'Atkinson Hyperlegible', Arial, Helvetica, sans-serif";

/** Roughly how wide a character of the figures' 12px text is, for laying text out before drawing. */
export const FIGURE_CHAR_WIDTH = 6.6;

export const ARROW_ID = "arrow";

export interface FigureFrame {
  width: number;
  height: number;
  title: string;
  body: string[];
}

/**
 * A figure as a standalone SVG for a paper or a poster: every colour and font is written on the
 * element it paints, so it opens the same in a browser, Inkscape, Illustrator or a journal's
 * system, and stays in the light inks whatever theme the builder is in.
 */
export function figureSvg({ width, height, title, body }: FigureFrame) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}" font-size="12" role="img">`,
    `<title>${escapeHtmlText(title)}</title>`,
    `<defs><marker id="${ARROW_ID}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${ink("ink-muted")}"/></marker></defs>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    ...body,
    `</svg>`,
  ].join("\n");
}
