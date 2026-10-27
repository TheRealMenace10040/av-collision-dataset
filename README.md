# California AV Collision Dataset

Every autonomous-vehicle collision report filed with the California DMV (form **OL 316**), turned from individual PDFs into one clean, searchable dataset with a small web dashboard.

California requires AV companies to file an OL 316 after any collision. The DMV publishes each one as its own PDF, with no bulk download. This project reads them all into `data/reports.csv` / `data/reports.json`.

## Why this exists / what is different

Earlier work covers the same reports ([El-Yabroudi et al., *Electronics* 14(4):651, 2025](https://doi.org/10.3390/electronics14040651), data through Sept 2024; [Haroon & Ryan](https://github.com/saquibmh/automated-california-av-dataset), data through June 2023). Those are snapshots and the Haroon & Ryan version relies on OCR. This project:

- **Reads the PDFs' fillable form fields directly**, so no OCR and far fewer transcription errors. Older revisions (2019 on) parse too.
- **Decodes the checkbox grid** (weather, lighting, road surface, movement before crash, collision type...) into plain words using the legend printed on the form.
- **Is built to be re-run**: a weekly GitHub Action fetches new reports and republishes the dataset and site.
- **Falls back gracefully** on flattened PDFs (text-only rows, flagged `parse_quality = text-only`).

## Data columns

See `COLUMNS` in [`src/parse.mjs`](src/parse.mjs). Highlights: `manufacturer`, `accident_date` (ISO), `accident_time` (24h), `city`, `county`, `av_*` and `other_*` vehicle info, `av_damage_severity`, `av_damage_areas`, `weather`, `lighting`, `av_movement_before`, `av_collision_type`, `mode` (autonomous/conventional), `narrative`.

- `narrative_mentions_injury` is a **keyword heuristic**, not an official finding.
- **Personal details are intentionally not extracted** (driver names, licence numbers, dates of birth, insurance policy numbers, phone numbers, witness details). Narratives are copied as filed; they are already redacted by the DMV/operators.

## Tech stack

Node.js (ESM), [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) for reading form fields, a dependency-free static dashboard in `docs/`, GitHub Actions + GitHub Pages.

## Run locally

```bash
npm install
npm run update      # download PDFs listed in data/urls.txt, then parse them
npm run serve       # preview docs/ at http://localhost:5183
```

Pipeline: `data/urls.txt` → `src/fetch.mjs` (polite download to `data/pdfs/`, git-ignored) → `src/build.mjs` (parse) → `data/reports.{csv,json}` and `docs/data.json`.

## Known limitation: finding the report list

The DMV collision-reports page (`dmv.ca.gov/.../autonomous-vehicle-collision-reports/`) returns HTTP 404 to scripted requests as of 2026-10-27, so `src/discover.mjs` cannot scrape the list of PDF links on its own, and this project does not try to evade that. Today `data/urls.txt` is a **seed of 13 reports** (2019-2026). To grow it to the full ~960+:

1. Open the DMV page in a normal browser, save it (Ctrl+S), then run `node src/discover.mjs saved-page.html`, **or**
2. paste the PDF links into `data/urls.txt` by hand, **or**
3. ask the DMV for a bulk or machine-readable feed.

Then `npm run update`. The weekly Action will keep going from whatever is in `urls.txt`.

## Deployment

GitHub repo + GitHub Pages (static, no backend). Site served from `docs/` by `.github/workflows/update.yml`. Live URL: _filled in after the first deploy_.

## Data source and licence

Reports: [California DMV](https://www.dmv.ca.gov/portal/vehicle-industry-services/autonomous-vehicles/autonomous-vehicle-collision-reports/) (public records). Code: MIT. Please cite the prior academic work above if you use this for research.
