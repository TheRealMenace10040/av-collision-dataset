// Finds report PDF links on the DMV collision-reports page and merges them into data/urls.txt.
//
// NOTE: as of 2026-10-27 the DMV page answers scripted requests with HTTP 404 (it appears to sit behind
// bot protection). This script does NOT try to evade that. If it fails, feed data/urls.txt another way:
//   - save the page from a normal browser (Ctrl+S) and run:  node src/discover.mjs saved-page.html
//   - or paste links by hand / from an archived copy of the page.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PAGE = 'https://www.dmv.ca.gov/portal/vehicle-industry-services/autonomous-vehicles/autonomous-vehicle-collision-reports/';
const UA = 'av-collision-dataset (open data project; github.com/TheRealMenace10040/av-collision-dataset)';

let html;
const local = process.argv[2];
if (local) {
  html = readFileSync(local, 'utf8');
} else {
  const res = await fetch(PAGE, { headers: { 'user-agent': UA } });
  if (!res.ok) {
    console.error(`DMV page returned HTTP ${res.status}; not retrying with a disguised client. See the note at the top of this file.`);
    process.exitCode = 2;
  } else {
    html = await res.text();
  }
}

const found = new Set();
for (const m of (html ?? '').matchAll(/href="([^"]*\/portal\/file\/[^"]+)"/gi)) {
  found.add(new URL(m[1], 'https://www.dmv.ca.gov').href);
}
if (html == null) {
  console.error('urls.txt left unchanged.');
} else {
const existing = existsSync('data/urls.txt') ? readFileSync('data/urls.txt', 'utf8').split(/\r?\n/).filter(Boolean) : [];
const all = [...new Set([...existing, ...found])];
writeFileSync('data/urls.txt', all.join('\n') + '\n');
console.log(`found ${found.size} links on page; urls.txt now has ${all.length} (${all.length - existing.length} new)`);
}
