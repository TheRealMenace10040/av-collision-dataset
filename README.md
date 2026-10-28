# California AV Collision Dataset

Every autonomous-vehicle collision report filed with the California DMV (form **OL 316**), turned from individual PDFs into one clean, searchable dataset with a small web dashboard.

California requires AV companies to file an OL 316 after any collision. The DMV publishes each one as its own PDF, with no bulk download. This project reads them all into `data/reports.csv` / `data/reports.json`.

## Why this exists / what is different

Earlier work covers the same reports ([El-Yabroudi et al., *Electronics* 14(4):651, 2025](https://doi.org/10.3390/electronics14040651), data through Sept 2024; [Haroon & Ryan](https://github.com/saquibmh/automated-california-av-dataset), data through June 2023). Those are snapshots and the Haroon & Ryan version relies on OCR. This project:

- **Reads the PDFs' fillable form fields directly**, so no OCR and far fewer transcription errors. Older revisions (2019 on) parse too.
- **Decodes the checkbox grid** (weather, lighting, road surface, movement before crash, collision type...) into plain words using the legend printed on the form.
- **Is reproducible**: `npm run update` re-downloads and re-parses everything from `data/urls.txt`; a GitHub Action can rebuild and republish the site on demand.
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
npm run sgo         # download NHTSA SGO crash CSVs
npm run update      # download PDFs listed in data/urls.txt, then parse + join everything
npm run serve       # preview docs/ at http://localhost:5183
```

Pipeline: `data/urls.txt` → `src/fetch.mjs` (polite download to `data/pdfs/`, git-ignored) → `src/build.mjs` (parse OL 316, load SGO, link) → `data/reports.{csv,json}`, `data/sgo_ca.{csv,json}` and `docs/data.json`.

## The DMV page was retired (and what that means)

The DMV's collision-reports index page (`dmv.ca.gov/.../autonomous-vehicle-collision-reports/`) now returns a real 404, even in a normal browser. Its "View Collision Reports" button points to UC Berkeley's [TIMS AV Safety Dashboard](https://tims.berkeley.edu/tools/avsafety.php), which says the DMV-reported testing-permit crash data (OL 316) covers **October 2014 to April 18, 2026** and is now archived. Crashes reported on or after April 28, 2026 flow through NHTSA's Standing General Order (SGO) reporting instead.

So the OL 316 reports are a **closed, historical set** and this dataset is a one-time build, not a feed:

- The report list was recovered from the Internet Archive's copy of the DMV page (2026-04-19), saved in `data/archive-snapshot-2026-04-19.html` and merged into `data/urls.txt` with `node src/discover.mjs <file>`. The individual PDFs are still hosted by the DMV and download normally.
- For crashes after April 2026 (and as a cross-check on the older ones), the dataset also includes NHTSA's public Standing General Order (SGO) ADS crash reports for California, see below.

## NHTSA SGO join

[`data/sgo_ca.csv`](data/sgo_ca.csv) holds every California ADS crash from NHTSA's public SGO files (latest version of each report). NHTSA publishes dates only as month-year, and redacts addresses, so a DMV report is linked to an SGO report only when **operator + month + time (HH:MM) + city** match, and each side has exactly one candidate. Ambiguous cases stay unlinked rather than guessed. Linked reports get `sgo_report_id`, `sgo_injury_severity`, `sgo_crash_with` and `sgo_roadway_type` in `data/reports.csv`. SGO also fills gaps the DMV forms never covered: structured injury severity, the other party's type, and crashes after April 2026.

`npm run sgo` re-downloads the NHTSA files (they refresh monthly) and `npm run build` rebuilds everything.

## Deployment

GitHub repo + GitHub Pages (static, no backend). Site served from `docs/` by `.github/workflows/pages.yml`. Live site: https://therealmenace10040.github.io/av-collision-dataset/

## Data source and licence

Reports: [California DMV](https://www.dmv.ca.gov/portal/vehicle-industry-services/autonomous-vehicles/autonomous-vehicle-collision-reports/) (public records). Code: MIT. Please cite the prior academic work above if you use this for research.
