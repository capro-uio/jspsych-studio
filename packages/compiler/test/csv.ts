/** The rows of a jsPsych CSV as records; jsPsych quotes every field, and no field here holds a quote. */
export function recordsOf(csv: string): Record<string, string>[] {
  const [header, ...rows] = csv
    .trim()
    .split(/\r?\n/)
    .map((line) => line.slice(1, -1).split('","'));
  return rows.map((row) => Object.fromEntries(header.map((name, index) => [name, row[index]])));
}
