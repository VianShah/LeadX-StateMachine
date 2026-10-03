// Parses an uploaded prospect list (.xlsx or .csv) into row objects keyed by the
// list's own header row. Column meaning is resolved later (cold.js mapColumns).
const ExcelJS = require('exceljs');
const { MAX_ROWS } = require('./cold');

class ListError extends Error {
  constructor(code, message) { super(message); this.code = code; this.status = 400; }
}

// Excel cells can hold rich text, hyperlinks, formulas or dates — flatten to text.
function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    return '';
  }
  return String(v);
}

function toObjects(headerRow, dataRows) {
  const headers = headerRow.map((h) => cellText(h).trim());
  if (!headers.some(Boolean)) throw new ListError('no_header', 'The first row must be a header row (e.g. Name, Phone, CIBIL).');
  const rows = [];
  for (const r of dataRows) {
    if (!r.some((c) => cellText(c).trim())) continue; // skip blank lines
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = cellText(r[i]).trim(); });
    rows.push(obj);
    if (rows.length > MAX_ROWS) throw new ListError('too_many_rows', `The list has more than ${MAX_ROWS} rows — split it into smaller files.`);
  }
  if (!rows.length) throw new ListError('empty', 'The list has a header row but no data rows.');
  return rows;
}

// RFC 4180-style CSV: quoted fields, escaped quotes, commas/newlines inside quotes.
// Auto-detects ";" as the delimiter when the header uses it (common in EU exports).
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const out = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); out.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); out.push(row); }
  return out;
}

async function parseList(buffer, filename) {
  const ext = String(filename || '').toLowerCase().split('.').pop();
  if (!buffer || !buffer.length) throw new ListError('empty', 'The uploaded file is empty.');
  if (ext === 'csv' || ext === 'txt') {
    const table = parseCsv(buffer.toString('utf8'));
    return toObjects(table[0] || [], table.slice(1));
  }
  if (ext === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(buffer); } catch (e) { throw new ListError('unreadable', 'Could not read this Excel file. Re-save it as .xlsx or export it as .csv.'); }
    const ws = wb.worksheets[0];
    if (!ws) throw new ListError('empty', 'The workbook has no sheets.');
    const table = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values.slice(1); // exceljs rows are 1-indexed
      table.push(vals);
    });
    return toObjects(table[0] || [], table.slice(1));
  }
  if (ext === 'xls') throw new ListError('old_excel', 'Old .xls files are not supported — save the sheet as .xlsx or .csv.');
  throw new ListError('unsupported', 'Upload an .xlsx or .csv file.');
}

function toCsv(rows) {
  const headers = Object.keys(rows[0] || {});
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [headers.map(esc).join(','), ...rows.map((r) => headers.map((h) => esc(r[h] ?? '')).join(','))].join('\n') + '\n';
}

module.exports = { parseList, parseCsv, toCsv, ListError };
