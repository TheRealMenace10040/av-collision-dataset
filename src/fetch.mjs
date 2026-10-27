// Downloads every PDF listed in data/urls.txt into data/pdfs (skips ones already present)
// and records url -> filename in data/urls.json. Polite: identifies itself, 1.5 s between requests.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';

const UA = 'av-collision-dataset (open data project; github.com/TheRealMenace10040/av-collision-dataset)';
const urls = readFileSync('data/urls.txt', 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
mkdirSync('data/pdfs', { recursive: true });
const map = existsSync('data/urls.json') ? JSON.parse(readFileSync('data/urls.json', 'utf8')) : {};

let got = 0, skipped = 0, failed = 0;
for (const url of urls) {
  const name = basename(new URL(url).pathname).replace(/-pdf$/i, '') + '.pdf';
  map[name] = url;
  if (existsSync(`data/pdfs/${name}`)) { skipped++; continue; }
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok || buf.subarray(0, 4).toString() !== '%PDF') throw new Error(`HTTP ${res.status}, not a PDF`);
    writeFileSync(`data/pdfs/${name}`, buf);
    got++;
  } catch (e) {
    failed++;
    console.warn('failed:', url, e.message);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
writeFileSync('data/urls.json', JSON.stringify(map, null, 2));
console.log(`downloaded ${got}, already had ${skipped}, failed ${failed}`);
