import { PDFDocument, StandardFonts } from 'pdf-lib';

export const MEDICAL_ARCHIVE_PART_BYTES = 24 * 1024 * 1024;
export const MEDICAL_ARCHIVE_INPUT_BYTES = 256 * 1024 * 1024;
const fixedDate = new Date('2000-01-01T00:00:00Z');
const safeText = value => String(value || '').replace(/[^\x20-\x7e]/g, '?');

export async function archiveSha256(bytes) {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}

/** Split by complete pages. The server's existing 25 MB document limit stays in place. */
export async function prepareMedicalArchive(input, { filename = 'medical-history.pdf', maxPartBytes = MEDICAL_ARCHIVE_PART_BYTES, onProgress = () => {} } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!bytes.byteLength || bytes.byteLength > MEDICAL_ARCHIVE_INPUT_BYTES) throw new Error('Choose a PDF up to 256 MB. Larger archives can be exported as separate client-specific files.');
  let source;
  try { source = await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch { throw new Error('This PDF could not be opened. Export an unlocked, readable PDF from the previous EHR.'); }
  const pageCount = source.getPageCount();
  if (!pageCount || pageCount > 5000) throw new Error('Use a PDF containing 1 to 5,000 pages. Export larger histories in date-range volumes.');
  const sourceHash = await archiveSha256(bytes);
  const parts = [];
  async function addPart(partBytes, startPage, endPage) {
    parts.push({ bytes: partBytes, startPage, endPage, sha256: await archiveSha256(partBytes) });
    onProgress({ pages: endPage, total: pageCount });
  }
  async function split(start, end) {
    const doc = await PDFDocument.create();
    doc.setCreationDate(fixedDate); doc.setModificationDate(fixedDate);
    const pages = await doc.copyPages(source, Array.from({ length: end - start }, (_, i) => start + i));
    pages.forEach(page => doc.addPage(page));
    const out = await doc.save();
    if (out.byteLength <= maxPartBytes) return addPart(out, start + 1, end);
    if (end - start === 1) throw new Error(`Source page ${start + 1} alone exceeds the upload limit. Retain the original EHR archive and export this page at a smaller size before retrying.`);
    const middle = start + Math.floor((end - start) / 2);
    await split(start, middle); await split(middle, end);
  }
  if (bytes.byteLength <= maxPartBytes) await addPart(bytes, 1, pageCount);
  else await split(0, pageCount);
  parts.forEach((part, index) => {
    part.title = `AW history ${sourceHash} pages ${part.startPage}-${part.endPage}`;
    part.filename = `medical-history-${sourceHash.slice(0, 12)}-volume-${String(index + 1).padStart(3, '0')}.pdf`;
    part.number = index + 1;
  });
  const manifest = await createArchiveManifest({ filename, sourceHash, sourceBytes: bytes.byteLength, pageCount, parts });
  return { sourceHash, filename, sourceBytes: bytes.byteLength, pageCount, parts, manifest };
}

async function createArchiveManifest({ filename, sourceHash, sourceBytes, pageCount, parts }) {
  const doc = await PDFDocument.create();
  doc.setCreationDate(fixedDate); doc.setModificationDate(fixedDate);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page, y;
  function line(text, size = 10) {
    if (!page || y < 45) { page = doc.addPage([612, 792]); y = 750; }
    page.drawText(safeText(text), { x: 36, y, size, font }); y -= size + 7;
  }
  line('AuricWell - imported medical history manifest', 15);
  line(`Original filename: ${safeText(filename).slice(0, 85)}`);
  line(`Source bytes: ${sourceBytes} | Source pages: ${pageCount} | Volumes: ${parts.length}`);
  line('Source SHA-256:'); line(sourceHash, 8);
  line('Complete source pages are retained in order. No clinical sessions or claims are created.');
  line('Verify every volume opens and downloads before retiring access to the previous EHR.');
  for (const part of parts) {
    line(`Volume ${part.number}: source pages ${part.startPage}-${part.endPage} | ${part.bytes.byteLength} bytes`, 11);
    line(part.filename, 9); line(`SHA-256: ${part.sha256}`, 8);
  }
  return { bytes: await doc.save(), title: `AW history ${sourceHash} manifest`, filename: `medical-history-${sourceHash.slice(0, 12)}-manifest.pdf` };
}

export function findArchiveDocument(documents, title) {
  const matches = documents.filter(doc => !doc.removed_at && doc.document_title === title);
  if (matches.length > 1) throw new Error('Duplicate archive volumes need review in the chart before continuing.');
  return matches[0] || null;
}

/** Sequential uploads let a retry resume complete volumes from the canonical chart listing. */
export async function uploadMedicalArchive(api, clientId, archive, { assertContext = () => {}, onProgress = () => {} } = {}) {
  assertContext();
  const response = await api.get(`/phi-documents/clients/${clientId}`, { skipGlobalLoading: true });
  assertContext();
  if (!Array.isArray(response.data)) throw new Error('The chart document list could not be verified. No archive was uploaded.');
  const documents = response.data;
  const results = [];
  const all = [...archive.parts, { ...archive.manifest, isManifest: true }];
  for (let index = 0; index < all.length; index++) {
    assertContext();
    const part = all[index];
    let document = findArchiveDocument(documents, part.title);
    if (!document) {
      const form = new FormData();
      form.append('file', new Blob([part.bytes], { type: 'application/pdf' }), part.filename);
      form.append('documentTitle', part.title);
      form.append('documentType', part.isManifest ? 'historical_record_manifest' : 'historical_medical_record');
      const result = await api.post(`/phi-documents/clients/${clientId}/upload`, form, { skipGlobalLoading: true });
      assertContext();
      document = result.data?.document;
      if (!Number(document?.id)) throw new Error('Upload did not return a document ID. Refresh the chart before retrying.');
      documents.push(document);
    }
    results.push({ ...document, isManifest: !!part.isManifest });
    onProgress({ uploaded: index + 1, total: all.length });
  }
  return results;
}
