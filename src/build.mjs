// Builds the dataset:
//   1. parses every DMV OL 316 PDF in data/pdfs (or argv[2])            -> data/reports.{json,csv}
//   2. loads NHTSA SGO ADS crash reports for California (data/sgo/*.csv) -> data/sgo_ca.{json,csv}
//   3. links the two where a unique operator+month+time+city match exists
//   4. writes docs/data.json (+ CSV copies) for the dashboard
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parsePdf, COLUMNS } from './parse.mjs';
import { loadSgoCalifornia, linkToOl316, SGO_COLUMNS } from './sgo.mjs';
import { toCsv } from './csv.mjs';

const dir = process.argv[2] ?? 'data/pdfs';
const urlMap = existsSync('data/urls.json') ? JSON.parse(readFileSync('data/urls.json', 'utf8')) : {};
const files = readdirSync(dir).filter((f) => /\.pdf$/i.test(f)).sort();

const rows = [];
const failures = [];
for (const f of files) {
  try {
    const row = await parsePdf(join(dir, f), urlMap[f] ?? '');
    // The DMV's file list also contains the blank OL 316 template; it has no manufacturer, date or narrative.
    if (!row.manufacturer && !row.accident_date && !row.narrative) { failures.push({ file: f, error: 'blank form template, skipped' }); continue; }
    rows.push(row);
  } catch (e) {
    failures.push({ file: f, error: e.message });
  }
}
rows.sort((a, b) => (b.accident_date || '').localeCompare(a.accident_date || ''));

const sgoFiles = existsSync('data/sgo') ? readdirSync('data/sgo').filter((f) => /\.csv$/i.test(f)).map((f) => join('data/sgo', f)) : [];
const sgo = loadSgoCalifornia(sgoFiles);
const linked = linkToOl316(rows, sgo);
sgo.sort((a, b) => (b.incident_month || '').localeCompare(a.incident_month || ''));

const REPORT_COLUMNS = [...COLUMNS, 'sgo_report_id', 'sgo_injury_severity', 'sgo_crash_with', 'sgo_roadway_type', 'sgo_match'];
const reportsCsv = toCsv(REPORT_COLUMNS, rows);
const sgoCsv = toCsv(SGO_COLUMNS, sgo);

// ---- unified incident list for the dashboard ----
const injured = (s) => !!s && !/no injur|property damage|unknown/i.test(s);
const incidents = [
  ...rows.map((r) => ({
    ...r,
    source: r.sgo_report_id ? 'both' : 'ol316',
    injury_severity: r.sgo_injury_severity,
    crash_with: r.sgo_crash_with,
  })),
  ...sgo.filter((s) => !s.linked_ol316_id).map((s) => ({
    report_id: s.sgo_report_id,
    source: 'sgo',
    source_url: '',
    manufacturer: s.reporting_entity,
    accident_date: s.incident_month,
    accident_time: s.incident_time,
    city: s.city,
    state: 'CA',
    location: '',
    av_damage_areas: s.av_contact_areas,
    weather: s.weather,
    av_movement_before: s.av_movement_before,
    narrative: s.narrative,
    narrative_mentions_injury: injured(s.injury_severity),
    injury_severity: s.injury_severity,
    crash_with: s.crash_with,
    sgo_report_id: s.sgo_report_id,
    parse_quality: 'sgo',
  })),
];
incidents.sort((a, b) => (b.accident_date || '').localeCompare(a.accident_date || ''));

mkdirSync('data', { recursive: true });
mkdirSync('docs', { recursive: true });
writeFileSync('data/reports.json', JSON.stringify(rows, null, 2));
writeFileSync('data/reports.csv', reportsCsv);
writeFileSync('data/sgo_ca.json', JSON.stringify(sgo, null, 2));
writeFileSync('data/sgo_ca.csv', sgoCsv);
writeFileSync('docs/reports.csv', reportsCsv);
writeFileSync('docs/sgo_ca.csv', sgoCsv);
writeFileSync('docs/data.json', JSON.stringify({
  generated: new Date().toISOString(),
  counts: { ol316: rows.length, sgo: sgo.length, linked, total: incidents.length },
  rows: incidents,
}));
writeFileSync('data/failures.json', JSON.stringify(failures, null, 2));
console.log(`OL 316: parsed ${rows.length}, ${failures.length} failures | SGO (CA): ${sgo.length} | linked: ${linked} | dashboard rows: ${incidents.length}`);
for (const f of failures.slice(0, 10)) console.log(' -', f.file, f.error);
