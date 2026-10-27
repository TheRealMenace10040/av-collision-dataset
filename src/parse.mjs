// Parses California DMV OL 316 (autonomous vehicle collision) PDFs by reading the
// fillable AcroForm fields directly -- no OCR needed.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

// Legends printed on page 3 of the form.
const LEGEND = {
  WEATHER: { A: 'clear', B: 'cloudy', C: 'raining', D: 'snowing', E: 'fog/visibility', F: 'other', G: 'wind' },
  LIGHTING: { A: 'daylight', B: 'dusk-dawn', C: 'dark-street lights', D: 'dark-no street lights', E: 'dark-street lights not functioning' },
  ROADWAY: { A: 'dry', B: 'wet', C: 'snowy-icy', D: 'slippery' },
  'ROAD CONDITIONS': {
    A: 'holes/deep rut', B: 'loose material', C: 'obstruction', D: 'construction zone',
    E: 'reduced width', F: 'flooded', G: 'other', H: 'no unusual conditions',
  },
  MOVEMENT: {
    A: 'stopped', B: 'proceeding straight', C: 'ran off road', D: 'making right turn', E: 'making left turn',
    F: 'making u-turn', G: 'backing', H: 'slowing/stopping', I: 'passing other vehicle', J: 'changing lanes',
    K: 'parking maneuver', L: 'entering traffic', M: 'other unsafe turning', N: 'crossing into opposing lane',
    O: 'parked', P: 'merging', Q: 'traveling wrong way', R: 'other',
  },
  TYPE: { A: 'head-on', B: 'side swipe', C: 'rear end', D: 'broadside', E: 'hit object', F: 'overturned', G: 'vehicle/pedestrian', H: 'other' },
  OTHER: {
    A: 'cvc sections violated', B: 'vision obscurement', C: 'inattention', D: 'stop & go traffic',
    E: 'entering/leaving ramp', F: 'previous collision', G: 'unfamiliar with road', H: 'defective vehicle equipment',
    I: 'uninvolved vehicle', J: 'other', K: 'none apparent', L: 'runaway vehicle',
  },
};

const CHECKED = (a) => a.checkBox && a.fieldValue && a.fieldValue !== 'Off';

async function readFields(path) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
  const fields = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const annots = await (await doc.getPage(p)).getAnnotations();
    for (const a of annots) {
      if (a.fieldName == null || a.fieldType == null) continue;
      fields.push({ page: p, name: a.fieldName, checked: CHECKED(a), value: a.checkBox ? '' : String(a.fieldValue ?? '').trim(), isCheck: !!a.checkBox });
    }
  }
  return fields;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function text(fields, name) {
  const f = fields.find((x) => !x.isCheck && norm(x.name) === norm(name));
  return f ? f.value : '';
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function isoDate(s) {
  s = /^[A-Za-z]/.test(s.trim()) ? s.trim() : s.replace(/\s+/g, '');
  let y, mo, d, m;
  if ((m = /^(\d{1,2})[\/.-](\d{1,3})[\/.-](\d{2,4})$/.exec(s))) [mo, d, y] = [m[1], String(+m[2]), m[3]];
  else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) [y, mo, d] = [m[1], m[2], m[3]];
  else if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(s))) {
    const i = MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase());
    if (i < 0) return '';
    [mo, d, y] = [String(i + 1), m[2], m[3]];
  } else return '';
  if (y.length === 2) y = '20' + y;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Last resort when the date field is unusable: the DMV names files like waymo_07252023 / zoox_061122.
function dateFromFilename(path) {
  const d = /(\d{2})(\d{2})(\d{4}|\d{2})(?!\d)/.exec(basename(path).replace(/\.pdf$/i, ''));
  return d ? isoDate(`${d[1]}/${d[2]}/${d[3]}`) : '';
}

function time24(t, am, pm) {
  const m = /^(\d{1,2}):?(\d{2})?/.exec(t);
  if (!m) return '';
  let h = +m[1];
  const min = m[2] ?? '00';
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

function codes(fields, category) {
  const out = { 1: [], 2: [], any: [] };
  const re = new RegExp(`^${category.replace(' ', '\\s+')}\\s+([A-Z])(?:\\s+(\\d))?$`, 'i');
  for (const f of fields) {
    if (!f.isCheck || !f.checked) continue;
    const m = re.exec(f.name.trim());
    if (!m) continue;
    const label = LEGEND[category][m[1].toUpperCase()] ?? m[1];
    (m[2] ? out[m[2]] : out.any).push(label);
  }
  return out;
}

const SEVERITY = [['unknown', 'unknown'], ['none', 'none'], ['minor', 'minor'], ['moderate', 'moderate'], ['major', 'major']];

function severity(fields) {
  for (const [name, label] of SEVERITY) {
    if (fields.some((f) => f.isCheck && f.checked && norm(f.name) === name)) return label;
  }
  return '';
}

function damagedAreas(fields) {
  const skip = new Set([
    'unknown', 'none', 'minor', 'moderate', 'major', 'am', 'pm', 'moving', 'stopped in traffic', 'pedestrian',
    'bicyclist', 'other', 'undefined', 'additional information attached',
  ]);
  return fields
    .filter((f) => f.isCheck && f.checked && f.page === 1 && !skip.has(norm(f.name)))
    .map((f) => norm(f.name).replace(/\s+\d+$/, ''))
    .filter((v, i, a) => v && a.indexOf(v) === i);
}

function vehicleMoving(fields, suffix) {
  const check = (n) => fields.some((f) => f.isCheck && f.checked && norm(f.name) === norm(n + suffix));
  if (check('Moving')) return 'moving';
  if (check('Stopped in Traffic')) return 'stopped in traffic';
  return '';
}

// Some operators submit a flattened PDF (typed text, no form fields, checkbox marks are just graphics).
// We keep what the text layer carries -- narrative, plus manufacturer/date from the filename -- and flag the row.
async function textFallback(path, sourceUrl) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
  let all = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const c = await (await doc.getPage(p)).getTextContent();
    all += ' ' + c.items.map((i) => i.str).join(' ');
  }
  all = all.replace(/\s+/g, ' ');
  const marker = /Conventional Mode Additional information attached\./i.exec(all);
  let narrative = '';
  if (marker) narrative = all.slice(marker.index + marker[0].length).split(/OL 316 \(REV/)[0].trim();

  const stem = basename(path).replace(/\.pdf$/i, '');
  const d = /(\d{2})(\d{2})(\d{4}|\d{2})(?!\d)/.exec(stem);
  const row = Object.fromEntries(COLUMNS.map((c) => [c, '']));
  Object.assign(row, {
    report_id: stem,
    source_url: sourceUrl,
    form_revision: 'OL316',
    manufacturer: stem.replace(/[-_]?(collision[-_]report.*|\d{6,8}.*)$/i, '').replace(/[-_]+/g, ' ').trim(),
    accident_date: d ? isoDate(`${d[1]}/${d[2]}/${d[3]}`) : '',
    narrative,
    narrative_mentions_injury: false,
    parse_quality: 'text-only',
  });
  return row;
}

export async function parsePdf(path, sourceUrl = '') {
  const fields = await readFields(path);
  if (!fields.length) return textFallback(path, sourceUrl);

  const date = text(fields, 'DATE Of ACCIDENT');
  const am = fields.some((f) => f.isCheck && f.checked && f.name === 'AM');
  const pm = fields.some((f) => f.isCheck && f.checked && f.name === 'PM');
  const narrative = fields.filter((f) => !f.isCheck).map((f) => f.value).sort((a, b) => b.length - a.length)[0] ?? '';
  const narrativeFlat = narrative.replace(/\s+/g, ' ').trim();

  const w = codes(fields, 'WEATHER'), l = codes(fields, 'LIGHTING'), r = codes(fields, 'ROADWAY');
  const rc = codes(fields, 'ROAD CONDITIONS'), mv = codes(fields, 'MOVEMENT'), ty = codes(fields, 'TYPE');
  const other = codes(fields, 'OTHER');
  const j = (arr) => arr.join('; ');

  const injuryFlags = fields.filter((f) => f.isCheck && f.checked && /injur|deceas/i.test(f.name)).map((f) => f.name.trim().toLowerCase());

  return {
    report_id: basename(path).replace(/\.pdf$/i, ''),
    source_url: sourceUrl,
    form_revision: 'OL316',
    parse_quality: 'form-fields',
    manufacturer: text(fields, 'MANufACTuRERS NAME'),
    accident_date: isoDate(date) || dateFromFilename(path),
    accident_time: time24(text(fields, 'Time of Accident'), am, pm),
    av_year: text(fields, 'VEhICLE YEAR'),
    av_make: text(fields, 'MAkE'),
    av_model: text(fields, 'MODEL'),
    av_registered_state: text(fields, 'STATE VEhICLE IS REGISTERED IN'),
    location: text(fields, 'section 2 accident infoRmation.0'),
    city: text(fields, 'section 2 accident infoRmation.1.0'),
    county: text(fields, 'section 2 accident infoRmation.1.1.0'),
    state: text(fields, 'section 2 accident infoRmation.1.1.1.0'),
    zip: text(fields, 'section 2 accident infoRmation.1.1.1.1'),
    av_status: vehicleMoving(fields, ''),
    vehicles_involved: text(fields, 'NuMBER Of VEhICLES INVOLVED'),
    av_damage_severity: severity(fields),
    av_damage_areas: j(damagedAreas(fields)),
    other_vehicle_year: text(fields, 'VEhICLE YEAR_2'),
    other_vehicle_model: text(fields, 'MODEL_2'),
    other_vehicle_status: vehicleMoving(fields, '_2'),
    mode: fields.some((f) => f.isCheck && f.checked && /^autonomous mode$/i.test(f.name.trim())) ? 'autonomous'
      : fields.some((f) => f.isCheck && f.checked && /^conventional mode$/i.test(f.name.trim())) ? 'conventional' : '',
    weather: j([...new Set([...w[1], ...w[2], ...w.any])]),
    lighting: j([...new Set([...l[1], ...l[2], ...l.any])]),
    road_surface: j([...new Set([...r[1], ...r[2], ...r.any])]),
    road_conditions: j([...new Set([...rc[1], ...rc[2], ...rc.any])]),
    av_movement_before: j(mv[1]),
    other_movement_before: j(mv[2]),
    av_collision_type: j(ty[1]),
    other_collision_type: j(ty[2]),
    other_factors: j(other.any),
    injury_or_death_boxes: j(injuryFlags),
    // Heuristic: narrative mentions an injury that is not negated. Treat as a lead, not a finding.
    narrative_mentions_injury: /\binjur|\bhospital|\bambulance|\bparamedic|\bEMS\b/i.test(narrativeFlat)
      && !/\b(no|without)\s+(reported\s+)?(injur|apparent injur)/i.test(narrativeFlat),
    narrative: narrativeFlat,
  };
}

export const COLUMNS = [
  'report_id', 'source_url', 'form_revision', 'parse_quality', 'manufacturer', 'accident_date', 'accident_time', 'av_year', 'av_make',
  'av_model', 'av_registered_state', 'location', 'city', 'county', 'state', 'zip', 'av_status', 'vehicles_involved',
  'av_damage_severity', 'av_damage_areas', 'other_vehicle_year', 'other_vehicle_model', 'other_vehicle_status', 'mode',
  'weather', 'lighting', 'road_surface', 'road_conditions', 'av_movement_before', 'other_movement_before',
  'av_collision_type', 'other_collision_type', 'other_factors', 'injury_or_death_boxes', 'narrative_mentions_injury', 'narrative',
];
