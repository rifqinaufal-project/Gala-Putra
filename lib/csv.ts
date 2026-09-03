export function createCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const escape = (value: string | number | null | undefined) => {
    const raw = value == null ? "" : String(value);
    const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
}
