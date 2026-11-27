import * as XLSX from "xlsx";

// V79 (Section 129): export the current view to a plain Excel workbook.
// One shared helper for every list: the rows exactly as the user currently
// sees them (same filters, same sort) and plain text cells: one header row
// with the column labels, then one row per record. No styling, no formulas,
// no extra sheets, so the file opens everywhere and stays small. The xlsx
// library is already a project dependency (it powers the import/export
// templates), so this adds no new package.

export interface ExportColumn<T> {
  label: string;
  value: (row: T) => string | number | undefined;
}

export function exportRowsToExcel<T>(fileName: string, sheetName: string, columns: ExportColumn<T>[], rows: T[]): void {
  const plain = (cell: string | number | undefined): string | number =>
    cell === undefined || cell === null ? "" : typeof cell === "number" ? cell : String(cell);
  const aoa: (string | number)[][] = [columns.map((column) => column.label)];
  for (const row of rows) aoa.push(columns.map((column) => plain(column.value(row))));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), sheetName.slice(0, 31));
  XLSX.writeFile(workbook, fileName, { bookType: "xlsx" });
}
