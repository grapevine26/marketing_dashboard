export function generateCSV(headers: string[], rows: (string | number)[][]): string {
  const escapeCell = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerRow = headers.map(escapeCell).join(",");
  const dataRows = rows
    .map((row) => row.map(escapeCell).join(","))
    .join("\r\n");

  // UTF-8 BOM for Excel compatibility
  return `\uFEFF${headerRow}\r\n${dataRows}`;
}
