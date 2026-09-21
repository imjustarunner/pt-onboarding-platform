import { validateDocumentBranding, resolveDocumentLetterhead, buildDocumentRender } from './libraryDocument.service.js';
import DocumentSigningService from './documentSigning.service.js';

export async function renderPrehireAuthoredDocument(doc, agencyId) {
  const document = { name: doc.title, bodyHtml: doc.bodyHtml, agencyId, brandingMode: doc.brandingMode || 'organization', letterheadTemplateId: doc.letterheadTemplateId || null };
  await validateDocumentBranding(document);
  const letterhead = await resolveDocumentLetterhead(document);
  const render = buildDocumentRender(document, letterhead);
  return Buffer.from(await DocumentSigningService.convertHTMLToPDF(render.html, render.options));
}
