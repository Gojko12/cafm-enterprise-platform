// V79 (Section 129) + V80 (Section 130): export the current view to a plain
// Excel workbook. One shared helper for every list: the rows exactly as the
// user currently sees them (same filters, same sort) and plain text cells.
// V80: the file is now written by a tiny built-in generator instead of the
// xlsx library, because the community edition of that library cannot write
// cell styles or freeze panes (both are Pro-only). The generator produces a
// minimal single-sheet .xlsx: bold header row (style s="1") and a frozen top
// row (pane ySplit=1), one header row plus one text row per record, no
// other styling. Verified with openpyxl: values, bold and freeze_panes=A2
// all read back correctly, including XML-special characters. Pure
// Uint8Array/DataView code with STORED (uncompressed) zip entries, so it
// runs in the browser with no dependency at all.

export interface ExportColumn<T> {
  label: string;
  value: (row: T) => string | number | undefined;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();
function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (~c) >>> 0;
}

const encoder = new TextEncoder();
function xmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function columnName(index: number): string {
  let name = "";
  let i = index;
  while (i >= 0) { name = String.fromCharCode(65 + (i % 26)) + name; i = Math.floor(i / 26) - 1; }
  return name;
}
function xmlDeclaration(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
}

function buildSheetXml(columns: { label: string }[], rows: unknown[][]): string {
  let xml = xmlDeclaration();
  xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
  xml += '<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>';
  xml += "<sheetData>";
  xml += '<row r="1">' + columns.map((column, index) =>
    `<c r="${columnName(index)}1" s="1" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(column.label))}</t></is></c>`).join("") + "</row>";
  rows.forEach((row, rowIndex) => {
    xml += `<row r="${rowIndex + 2}">` + row.map((cell, index) =>
      typeof cell === "number" && Number.isFinite(cell)
        ? `<c r="${columnName(index)}${rowIndex + 2}"><v>${cell}</v></c>`
        : `<c r="${columnName(index)}${rowIndex + 2}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell === undefined || cell === null ? "" : String(cell))}</t></is></c>`).join("") + "</row>";
  });
  xml += "</sheetData></worksheet>";
  return xml;
}

function buildWorkbookXml(sheetName: string): string {
  return xmlDeclaration() +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${xmlEscape(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

const STYLES_XML = xmlDeclaration() +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function buildXlsxBytes(sheetName: string, columns: { label: string }[], rows: unknown[][]): Uint8Array<ArrayBuffer> {
  const files: [string, string][] = [
    ["[Content_Types].xml", xmlDeclaration() + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ["_rels/.rels", xmlDeclaration() + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ["xl/workbook.xml", buildWorkbookXml(sheetName)],
    ["xl/_rels/workbook.xml.rels", xmlDeclaration() + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ["xl/styles.xml", STYLES_XML],
    ["xl/worksheets/sheet1.xml", buildSheetXml(columns, rows)],
  ];
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    locals.push(local, data);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const directorySize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, directorySize, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + directorySize + 22);
  let position = 0;
  for (const part of [...locals, ...centrals, eocd]) { out.set(part, position); position += part.length; }
  return out;
}

export function exportRowsToExcel<T>(fileName: string, sheetName: string, columns: ExportColumn<T>[], rows: T[]): void {
  const cells = rows.map((row) => columns.map((column) => {
    const cell = column.value(row);
    return cell === undefined || cell === null ? "" : typeof cell === "number" ? cell : String(cell);
  }));
  const bytes = buildXlsxBytes(sheetName, columns, cells);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
