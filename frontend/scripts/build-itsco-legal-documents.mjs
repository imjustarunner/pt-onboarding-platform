import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { itscoLegalLinks } from '../src/content/itscoLegalDocuments.js';
import { renderItscoLegalHtml } from '../src/utils/itscoLegalHtml.js';
const destination = fileURLToPath(new URL('../../deliverables/itsco-legal/', import.meta.url));
mkdirSync(destination, {recursive:true});
for (const {type} of itscoLegalLinks) writeFileSync(`${destination}/${type}.html`, renderItscoLegalHtml(type));
console.log(`Prepared three ITSCO legal documents in ${destination}`);
