import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import tokens from "../tokens.json" with { type: "json" };

const css = readFileSync(join(import.meta.dirname, "..", "tokens.css"), "utf8");

function declared(name: string) {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  return match?.[1].replace(/\s+/g, " ").trim();
}

// tokens.json is what designers and other tools read; tokens.css is what pages use. Neither is
// generated from the other, so this is what keeps them saying the same thing.
describe("the colour tokens", () => {
  it.each(tokens.color.tokens.map((token) => [token.name, token.value] as const))(
    "%s has the same light and dark value in the stylesheet",
    (name, { light, dark }) => {
      expect(declared(name)?.toLowerCase()).toBe(`light-dark(${light}, ${dark})`.toLowerCase());
    },
  );

  it.each(tokens.shadow.tokens.map((token) => [token.name, token.value] as const))(
    "%s casts the same shadow in the stylesheet",
    (name, { light, dark }) => {
      const offsets = light.slice(0, light.indexOf("rgba"));
      const colour = (shadow: string) => shadow.slice(shadow.indexOf("rgba"));
      expect(declared(name)).toBe(`${offsets}light-dark(${colour(light)}, ${colour(dark)})`);
    },
  );

  it("declares no colour the JSON leaves out", () => {
    const names = [...css.matchAll(/--([a-z-]+):[^;]*light-dark\(/g)].map((match) => match[1]);
    const known = [...tokens.color.tokens, ...tokens.shadow.tokens].map((token) => token.name);
    expect(names.sort()).toEqual(known.sort());
  });
});
