// jsPsych quotes every field and doubles any quote inside one, as JSON data such as gaze samples
// holds, and a field can hold a line break.
function fieldsOf(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      rows.push([...row, field]);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }
  if (field !== "" || row.length > 0) rows.push([...row, field]);
  return rows;
}

/** The rows of a jsPsych CSV as records. */
export function recordsOf(csv: string): Record<string, string>[] {
  const [header, ...rows] = fieldsOf(csv.trim());
  return rows.map((row) => Object.fromEntries(header.map((name, index) => [name, row[index]])));
}
