// Parses every PDF in data/pdfs (or the dir given as argv[2]) and writes
// data/reports.json, data/reports.csv and docs/data.json (for the dashboard).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parsePdf, COLUMNS } from './parse.mjs';

const dir = process.argv[2] ?? 'data/pdfs';
const urlMap = existsSync('data/urls.json') ? JSON.parse(readFileSync('data/urls.json', 'utf8')) : {};
const files = readdirSync(dir).filter((f) => /\.pdf$/i.test(f)).sort();

const rows = [];
const failures = [];
for (const f of files) {
  try {
    rows.push(await parsePdf(join(dir, f), urlMap[f] ?? ''));
  } catch (e) {
    failures.push({ file: f, error: e.message });
  }
}
rows.sort((a, b) => (b.accident_date || '').localeCompare(a.accident_date || ''));

const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => esc(r[c])).join(','))].join('\n');

mkdirSync('data', { recursive: true });
mkdirSync('docs', { recursive: true });
writeFileSync('data/reports.json', JSON.stringify(rows, null, 2));
writeFileSync('data/reports.csv', csv);
writeFileSync('docs/reports.csv', csv);
writeFileSync('docs/data.json', JSON.stringify({ generated: new Date().toISOString(), count: rows.length, rows }));
writeFileSync('data/failures.json', JSON.stringify(failures, null, 2));
console.log(`parsed ${rows.length} reports, ${failures.length} failures`);
for (const f of failures.slice(0, 10)) console.log(' -', f.file, f.error);
