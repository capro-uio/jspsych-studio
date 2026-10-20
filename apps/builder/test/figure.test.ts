import { describe, expect, it } from "vitest";
import { figureSvg, ink } from "../src/lib/figure.ts";

describe("ink", () => {
  it("gives a brand colour in its light ink", () => {
    expect(ink("paper")).toBe("#F6F4EE");
  });

  it("refuses a colour the brand does not have, rather than painting with nothing", () => {
    expect(() => ink("chartreuse")).toThrow(/no brand colour named chartreuse/);
  });
});

describe("figureSvg", () => {
  it("frames the body at its size on white, with its title and an arrowhead to use", () => {
    const svg = figureSvg({ width: 30, height: 20, title: "<t>", body: ["<g/>"] });
    expect(svg).toMatch(/^<svg [^>]*width="30" height="20" viewBox="0 0 30 20"/);
    expect(svg).toContain("<title>&lt;t&gt;</title>");
    expect(svg).toContain('<marker id="arrow"');
    expect(svg).toContain('<rect width="100%" height="100%" fill="#ffffff"/>\n<g/>\n</svg>');
  });
});
