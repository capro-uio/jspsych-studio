import { describe, expect, it } from "vitest";
import { crossFactors, rowCount } from "../src/lib/factors.ts";

describe("crossing factors", () => {
  it("makes one row per combination", () => {
    const { rows } = crossFactors([
      { name: "word", levels: "RED, BLUE" },
      { name: "ink", levels: "red, blue" },
    ]);
    expect(rows).toHaveLength(4);
    expect(rows).toContainEqual({ word: "RED", ink: "red" });
    expect(rows).toContainEqual({ word: "BLUE", ink: "red" });
  });

  it("keeps the factors in the order they were given", () => {
    const { rows } = crossFactors([
      { name: "word", levels: "RED" },
      { name: "ink", levels: "blue" },
    ]);
    expect(Object.keys(rows[0])).toEqual(["word", "ink"]);
  });

  it("counts the rows before making them", () => {
    expect(
      rowCount([
        { name: "a", levels: "1,2,3" },
        { name: "b", levels: "x,y" },
      ]),
    ).toBe(6);
    expect(rowCount([{ name: "", levels: "" }])).toBe(0);
  });

  it("ignores spacing around values", () => {
    const { rows } = crossFactors([{ name: " side ", levels: " left ,right " }]);
    expect(rows).toEqual([{ side: "left" }, { side: "right" }]);
  });

  it("says what is wrong rather than making an empty table", () => {
    expect(crossFactors([]).problems).toContain("add at least one factor");
    expect(crossFactors([{ name: "word", levels: "" }]).problems[0]).toMatch(/no values/);
    expect(crossFactors([{ name: "", levels: "a" }]).problems).toContain(
      "every factor needs a name",
    );
    expect(
      crossFactors([
        { name: "word", levels: "a" },
        { name: "word", levels: "b" },
      ]).problems,
    ).toContain("two factors share a name");
  });

  it("handles a single factor", () => {
    expect(crossFactors([{ name: "side", levels: "left,right" }]).rows).toEqual([
      { side: "left" },
      { side: "right" },
    ]);
  });
});
