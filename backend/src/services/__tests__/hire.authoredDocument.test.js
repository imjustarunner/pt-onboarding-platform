import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../libraryDocument.service.js', () => ({ validateDocumentBranding:vi.fn(), resolveDocumentLetterhead:vi.fn(), buildDocumentRender:vi.fn() }));
vi.mock('../documentSigning.service.js', () => ({ default:{convertHTMLToPDF:vi.fn()} }));
import { validateDocumentBranding, resolveDocumentLetterhead, buildDocumentRender } from '../libraryDocument.service.js';
import DocumentSigningService from '../documentSigning.service.js';
import { renderPrehireAuthoredDocument } from '../prehireAuthoredDocument.service.js';
beforeEach(() => vi.resetAllMocks());
it('renders authored acknowledgements on the correct agency letterhead using the exact export renderer', async () => {
  const doc={title:'Handbook acknowledgement',bodyHtml:'<p>I have read the handbook.</p>',brandingMode:'letterhead',letterheadTemplateId:5};
  resolveDocumentLetterhead.mockResolvedValue({headerHtml:'Agency letterhead'});
  buildDocumentRender.mockReturnValue({html:'<html>Branded acknowledgement</html>',options:{disableFallback:true}});
  DocumentSigningService.convertHTMLToPDF.mockResolvedValue(Buffer.from('%PDF-branded-document'));
  expect((await renderPrehireAuthoredDocument(doc,2)).toString()).toBe('%PDF-branded-document');
  expect(validateDocumentBranding).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,letterheadTemplateId:5}));
  expect(buildDocumentRender).toHaveBeenCalledWith(expect.objectContaining({name:doc.title,bodyHtml:doc.bodyHtml,agencyId:2}),{headerHtml:'Agency letterhead'});
  expect(DocumentSigningService.convertHTMLToPDF).toHaveBeenCalledWith('<html>Branded acknowledgement</html>',{disableFallback:true});
});
it('rejects another tenant’s letterhead before any render', async () => {
  validateDocumentBranding.mockRejectedValue(Object.assign(new Error('Letterhead unavailable'),{status:400}));
  await expect(renderPrehireAuthoredDocument({bodyHtml:'<p>Document</p>',brandingMode:'letterhead',letterheadTemplateId:9},2)).rejects.toThrow('Letterhead unavailable');
  expect(DocumentSigningService.convertHTMLToPDF).not.toHaveBeenCalled();
});
