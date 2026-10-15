export interface Factor {
  name: string;
  /** Levels as typed, comma separated: "red, blue". */
  levels: string;
}

export interface CrossResult {
  rows: Record<string, string>[];
  problems: string[];
}

export const MANY_ROWS = 200;

function levelsOf(factor: Factor) {
  return factor.levels
    .split(",")
    .map((level) => level.trim())
    .filter(Boolean);
}

export function rowCount(factors: Factor[]) {
  const usable = factors.filter((factor) => factor.name.trim() && levelsOf(factor).length > 0);
  if (usable.length === 0) return 0;
  return usable.reduce((total, factor) => total * levelsOf(factor).length, 1);
}

/** Every combination of every factor's levels, one row each: a fully crossed design. */
export function crossFactors(factors: Factor[]): CrossResult {
  const problems: string[] = [];
  const named = factors.filter((factor) => factor.name.trim() || factor.levels.trim());

  for (const factor of named) {
    if (!factor.name.trim()) problems.push("every factor needs a name");
    else if (levelsOf(factor).length === 0) {
      problems.push(`"${factor.name.trim()}" has no values; separate them with commas`);
    }
  }

  const names = named.map((factor) => factor.name.trim()).filter(Boolean);
  if (new Set(names).size !== names.length) problems.push("two factors share a name");
  if (named.length === 0) problems.push("add at least one factor");
  if (problems.length > 0) return { rows: [], problems };

  let rows: Record<string, string>[] = [{}];
  for (const factor of named) {
    const name = factor.name.trim();
    rows = rows.flatMap((row) => levelsOf(factor).map((level) => ({ ...row, [name]: level })));
  }
  return { rows, problems };
}
