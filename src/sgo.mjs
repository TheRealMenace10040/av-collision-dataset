// NHTSA Standing General Order (SGO) ADS crash reports, California only, and a linker that matches them
// to DMV OL 316 reports.
//
// SGO public data has month-level dates (e.g. "AUG-2026") with the exact time and city, and redacted
// addresses, so the link key is: same operator + same month + same HH:MM + same city, and it must be unique
// on both sides. Anything ambiguous stays unlinked rather than guessed.
import { readFileSync } from 'node:fs';
import { parseCsv } from './csv.mjs';

const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

export const SGO_COLUMNS = [
  'sgo_report_id', 'sgo_report_version', 'report_type', 'reporting_entity', 'incident_month', 'incident_time', 'city',
  'roadway_type', 'crash_with', 'injury_severity', 'av_movement_before', 'av_speed_mph', 'av_contact_areas', 'weather',
  'narrative', 'linked_ol316_id',
];

const key = (name) => String(name ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/)[0] ?? '';
export const operatorKey = key;

function flags(h, row, prefix, skip = /unknown|unk/i) {
  const out = [];
  h.forEach((name, i) => {
    if (name.startsWith(prefix) && row[i].trim() === 'Y' && !skip.test(name)) out.push(name.slice(prefix.length).trim().toLowerCase());
  });
  return out.join('; ');
}

export function loadSgoCalifornia(files) {
  const latest = new Map();
  for (const file of files) {
    const [h, ...rows] = parseCsv(readFileSync(file, 'utf8').replace(/^﻿/, ''));
    const ix = Object.fromEntries(h.map((n, i) => [n, i]));
    for (const r of rows) {
      if (!/^CA\s*$/.test(r[ix['State']] ?? '')) continue;
      const id = r[ix['Report ID']];
      const version = +r[ix['Report Version']] || 1;
      if (latest.has(id) && latest.get(id).sgo_report_version >= version) continue;
      const m = /^([A-Z]{3})-(\d{4})$/.exec((r[ix['Incident Date']] ?? '').trim());
      latest.set(id, {
        sgo_report_id: id,
        sgo_report_version: version,
        report_type: r[ix['Report Type']].trim(),
        reporting_entity: r[ix['Reporting Entity']].trim(),
        incident_month: m ? `${m[2]}-${MONTHS[m[1]]}` : '',
        incident_time: (r[ix['Incident Time (24:00)']] ?? '').trim(),
        city: (r[ix['City']] ?? '').trim(),
        roadway_type: (r[ix['Roadway Type']] ?? '').trim(),
        crash_with: (r[ix['Crash With']] ?? '').trim(),
        injury_severity: (r[ix['Highest Injury Severity Alleged']] ?? '').trim(),
        av_movement_before: (r[ix['SV Pre-Crash Movement']] ?? '').trim(),
        av_speed_mph: (r[ix['SV Precrash Speed (MPH)']] ?? '').trim(),
        av_contact_areas: flags(h, r, 'SV Contact Area - '),
        weather: flags(h, r, 'Weather - '),
        narrative: (r[ix['Narrative']] ?? '').replace(/\s+/g, ' ').trim(),
        linked_ol316_id: '',
      });
    }
  }
  return [...latest.values()];
}

// Mutates both sides: sets linked_ol316_id on SGO rows and sgo_* fields on OL 316 rows.
export function linkToOl316(ol316, sgo) {
  const k = (month, entity, time, city) => (month && time && city ? [month, operatorKey(entity), time, city.toLowerCase()].join('|') : '');
  const sgoBy = new Map(), olBy = new Map();
  for (const s of sgo) { const x = k(s.incident_month, s.reporting_entity, s.incident_time, s.city); if (x) (sgoBy.get(x) ?? sgoBy.set(x, []).get(x)).push(s); }
  for (const o of ol316) { const x = k(o.accident_date.slice(0, 7), o.manufacturer, o.accident_time, o.city); o._key = x; if (x) (olBy.get(x) ?? olBy.set(x, []).get(x)).push(o); }

  let linked = 0;
  for (const o of ol316) {
    o.sgo_report_id = o.sgo_injury_severity = o.sgo_crash_with = o.sgo_roadway_type = o.sgo_match = '';
    const a = olBy.get(o._key), b = sgoBy.get(o._key);
    if (!o._key || a?.length !== 1 || b?.length !== 1) continue;
    const s = b[0];
    o.sgo_report_id = s.sgo_report_id;
    o.sgo_injury_severity = s.injury_severity;
    o.sgo_crash_with = s.crash_with;
    o.sgo_roadway_type = s.roadway_type;
    o.sgo_match = 'operator+month+time+city';
    s.linked_ol316_id = o.report_id;
    linked++;
  }
  for (const o of ol316) delete o._key;
  return linked;
}
