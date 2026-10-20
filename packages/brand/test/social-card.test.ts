import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CARD_PATH, CARD_SIZE, socialCardHtml } from "../scripts/social-card.ts";
import tokens from "../tokens.json" with { type: "json" };

function pngSize(path: string) {
  const header = readFileSync(path).subarray(0, 24);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

describe("the social card", () => {
  it("is drawn in the light inks the tokens name", () => {
    const html = socialCardHtml();
    const light = (name: string) =>
      tokens.color.tokens.find((token) => token.name === name)?.value.light;
    for (const name of ["paper", "ink", "stimulus-fill", "mask"]) {
      expect(html).toContain(light(name));
    }
  });

  it("embeds its fonts, so it renders the same without the network", () => {
    expect(socialCardHtml().match(/url\(data:font\/woff2;base64,/g)).toHaveLength(4);
  });

  it("has been rendered at the size link previews crop to", () => {
    expect(pngSize(CARD_PATH)).toEqual(CARD_SIZE);
  });
});
