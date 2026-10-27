// Downloads NHTSA's public Standing General Order ADS incident CSVs (2021-2025 archive + current file).
// NHTSA refreshes the current file monthly; re-run this and `npm run build` to pick up new crashes.
import { writeFileSync, mkdirSync } from 'node:fs';

const UA = 'av-collision-dataset (open data project; github.com/TheRealMenace10040/av-collision-dataset)';
const base = 'https://static.nhtsa.gov/odi/ffdd/sgo-2021-01';
const files = {
  'Archive-2021-2025_ADS.csv': `${base}/Archive-2021-2025/SGO-2021-01_Incident_Reports_ADS.csv`,
  'SGO-2021-01_Incident_Reports_ADS.csv': `${base}/SGO-2021-01_Incident_Reports_ADS.csv`,
};
mkdirSync('data/sgo', { recursive: true });
for (const [name, url] of Object.entries(files)) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`data/sgo/${name}`, buf);
  console.log(`saved data/sgo/${name} (${(buf.length / 1e6).toFixed(1)} MB)`);
}
