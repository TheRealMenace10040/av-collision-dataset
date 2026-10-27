import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'fs';
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(process.argv[2])) }).promise;
for (let p = 1; p <= doc.numPages; p++) {
  const c = await (await doc.getPage(p)).getTextContent();
  console.log('--- page', p);
  console.log(c.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').slice(0, 2600));
}
