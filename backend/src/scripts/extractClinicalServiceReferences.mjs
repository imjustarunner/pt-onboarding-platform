// Rebuild the versioned reference from the owner-supplied source. This extracts
// descriptive evidence only; it does not import payer rules or grant services.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ITSCO_DIRECT_BOOKABLE_CODES, ITSCO_DIRECT_SERVICE_META } from '../config/tenantServiceSuiteCatalog.js';

const file = process.argv[2];
if (!file) throw new Error('Provide the October 2026 SBHS Billing Manual PDF path.');
const bytes = readFileSync(file);
const pdf = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
const pages = [], pageItems = [];
for (let page = 1; page <= pdf.numPages; page += 1) {
  const items = (await (await pdf.getPage(page)).getTextContent()).items;
  pageItems.push(items);
  pages.push(items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim());
}
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const section = (text, from, until) => clean(text.split(from)[1]?.split(until)[0]);
const records = {};
for (const code of ['H0002', ...ITSCO_DIRECT_BOOKABLE_CODES]) {
  // First matching page is the base code. Subsequent ET/other modifiers are
  // deliberately excluded: availability of base H2011 must not enable H2011 ET.
  const index = pages.findIndex(text => text.startsWith(code + ' '));
  if (index < 0) {
    records[code] = { code, title: ITSCO_DIRECT_SERVICE_META[code]?.name || code,
      status: 'not-in-supplied-manual', sourcePages: [], serviceDescription: ITSCO_DIRECT_SERVICE_META[code]?.description || '',
      documentation: '', providerQualifications: '', placesOfService: '', ageGroups: '',
      note: 'This code is not described in the supplied October 2026 SBHS manual. Existing agency and payer rules remain authoritative.' };
    continue;
  }
  // The manual has three independent columns. PDF object-stream order mixes
  // role/setting lists into clinical sentences on pages such as H0004. Sort
  // each column by visual baseline before extracting the actual section text.
  const items = pageItems[index].filter(item => item.str.trim() && item.transform[5] > 48 && item.transform[5] < 740);
  const descriptionWord = items.find(item => /^Description:?$/i.test(item.str) && item.transform[4] > 140 && item.transform[4] < 300);
  const descriptionHeading = items.find(item => /Service\s+Description/i.test(item.str)) || (descriptionWord && items.find(item => /^Service$/i.test(item.str) && Math.abs(item.transform[5]-descriptionWord.transform[5]) < 2 && item.transform[4] < descriptionWord.transform[4]));
  const minimumHeading = items.find(item => /^Min\s*:/i.test(item.str));
  if (!descriptionHeading || !minimumHeading) throw new Error(`Review source layout before extracting ${code}.`);
  const centerX = descriptionHeading.transform[4] - 12, rightX = minimumHeading.transform[4] - 3;
  const column = selected => clean(selected.sort((a,b) => Math.round(b.transform[5]/2)-Math.round(a.transform[5]/2) || a.transform[4]-b.transform[4]).map(item => item.str).join(' '));
  const left = column(items.filter(item => item.transform[4] < centerX));
  const middle = column(items.filter(item => item.transform[4] >= centerX && item.transform[4] < rightX));
  const right = column(items.filter(item => item.transform[4] >= rightX));
  const serviceDescription = section(middle, /Service\s+Description\s*:\s*\(\s*Including example activities\s*\)/i, /Notes\s*:/i);
  const documentation = section(middle, /Notes\s*:\s*\(\s*Including specific documentation and\/?or diagnosis requirements\s*\)/i, /$^/);
  const providerQualifications = section(right, /Service\s+Provider/i, /Provider\s+Types/i);
  const placesOfService = section(left, /Place\s+of\s+Service/i, /$^/);
  const header = middle.split(/Service\s+Description\s*:/i)[0];
  const minDurationText = clean(right.match(/Min\s*:\s*(.*?)(?=Max\s*:)/i)?.[1]);
  const maxDurationText = clean(right.match(/Max\s*:\s*(.*?)(?=Service\s+Provider)/i)?.[1]);
  if (!serviceDescription || !providerQualifications) throw new Error(`Missing descriptive evidence for ${code}.`);
  records[code] = {
    code, title: ITSCO_DIRECT_SERVICE_META[code]?.name || code, status: 'available', sourcePages: [index + 1],
    ageGroups: clean(header.match(/Child\s*\(.*$/)?.[0] || header.match(/AGES?\s*:\s*ALL/i)?.[0]),
    minDurationText, maxDurationText,
    minUnitMinutes: Number(minDurationText.match(/^(\d+)\s*mins?/i)?.[1]) || null,
    maxUnitMinutes: Number(maxDurationText.match(/^(\d+)\s*mins?/i)?.[1]) || null,
    unitLabel: clean(right.match(/\b(ENC|MINS|DAY|HOUR)\b/i)?.[0]).toUpperCase(),
    serviceDescription, documentation, providerQualifications, placesOfService,
    allowedPlaceOfServiceCodes: [...new Set([...placesOfService.matchAll(/\b(\d{2})\s+[A-Za-z]/g)].map(match => match[1]))],
    sourceText: [middle, right, left].join('\n\n')
  };
}
const output = {
  schemaVersion: 1, edition: '2026-10', effectiveDate: '2026-10-01',
  sourceTitle: 'October 2026 State Behavioral Health Services Billing Manual',
  sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  sourceNotice: 'Descriptive reference from the supplied manual. Availability does not establish coverage, individual qualifications, service authorization or a payable claim.',
  records
};
writeFileSync(new URL('../content/clinical-service-reference-2026-10.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
console.log(`Extracted ${Object.keys(records).length} offered-service references; ${Object.values(records).filter(record => record.status === 'available').length} have supplied manual pages.`);
