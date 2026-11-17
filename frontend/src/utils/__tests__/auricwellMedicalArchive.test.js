import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName } from 'pdf-lib';
import { prepareMedicalArchive, uploadMedicalArchive } from '../auricwellMedicalArchive.js';
beforeAll(() => vi.stubGlobal('crypto', webcrypto));
async function pdf(pages = 6) { const doc = await PDFDocument.create(); for (let i = 0; i < pages; i++) doc.addPage().drawText(`Synthetic medical history page ${i + 1}`); return doc.save(); }
describe('medical history archive', () => {
  it('preserves the original bytes when the complete file fits', async () => {
    const bytes = await pdf(); const archive = await prepareMedicalArchive(bytes);
    expect(archive.parts).toHaveLength(1); expect(archive.parts[0].bytes).toBe(bytes); expect(archive.parts[0]).toMatchObject({ startPage: 1, endPage: 6 });
    expect((await PDFDocument.load(archive.manifest.bytes)).getPageCount()).toBeGreaterThan(0);
  });
  it('splits into complete ordered pages below the upload limit without gaps', async () => {
    const archive = await prepareMedicalArchive(await pdf(), { maxPartBytes: 1100 });
    expect(archive.parts.length).toBeGreaterThan(1); let next = 1;
    for (const part of archive.parts) { expect(part.bytes.byteLength).toBeLessThanOrEqual(1100); expect(part.startPage).toBe(next); expect((await PDFDocument.load(part.bytes)).getPageCount()).toBe(part.endPage - part.startPage + 1); next = part.endPage + 1; }
    expect(next).toBe(7);
  });
  it('losslessly compresses a real PDF above 25 MB into bounded volumes with reproducible integrity hashes', async () => {
    const doc = await PDFDocument.create();
    const content = '%' + 'x'.repeat(3 * 1024 * 1024) + '\n';
    for (let i = 0; i < 9; i++) {
      const page = doc.addPage();
      page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream(content)));
    }
    const bytes = await doc.save(); expect(bytes.byteLength).toBeGreaterThan(25 * 1024 * 1024);
    const archive = await prepareMedicalArchive(bytes);
    expect(archive.parts.length).toBeGreaterThanOrEqual(1);
    expect(archive.convertedPages).toEqual([]);
    expect(archive.parts.every(part => part.bytes.byteLength < 25 * 1024 * 1024)).toBe(true);
    expect(archive.parts.reduce((count, part) => count + part.endPage - part.startPage + 1, 0)).toBe(9);
    const retry = await prepareMedicalArchive(bytes);
    expect(retry.parts.map(part => part.sha256)).toEqual(archive.parts.map(part => part.sha256));
  }, 15000);
  it('rejects invalid, locked or unsplittable files before uploading', async () => {
    await expect(prepareMedicalArchive(new TextEncoder().encode('not a PDF'))).rejects.toThrow('could not be opened');
    await expect(prepareMedicalArchive(await pdf(1), { maxPartBytes: 100 })).rejects.toThrow('page 1 alone');
  });
  it('resumes complete volumes after an interrupted upload and saves the manifest last', async () => {
    const archive = await prepareMedicalArchive(await pdf(3), { maxPartBytes: 1100 }); const saved = []; let fail = true;
    const api = { get: vi.fn(async () => ({ data: [...saved] })), post: vi.fn(async (_url, form) => { if (saved.length === 1 && fail) throw new Error('Interrupted'); const document = { id: saved.length + 1, document_title: form.get('documentTitle') }; saved.push(document); return { data: { document } }; }) };
    await expect(uploadMedicalArchive(api, 20, archive)).rejects.toThrow('Interrupted'); expect(saved).toHaveLength(1);
    fail = false; await uploadMedicalArchive(api, 20, archive); expect(saved).toHaveLength(archive.parts.length + 1); expect(saved.at(-1).document_title).toBe(archive.manifest.title);
  });
  it('never proceeds after a client context change or an unverifiable document listing', async () => {
    const archive = await prepareMedicalArchive(await pdf(1)); const api = { get: vi.fn(async () => ({ data: null })), post: vi.fn() };
    await expect(uploadMedicalArchive(api, 20, archive)).rejects.toThrow('list could not be verified'); expect(api.post).not.toHaveBeenCalled();
    await expect(uploadMedicalArchive(api, 20, archive, { assertContext: () => { throw new Error('Changed client'); } })).rejects.toThrow('Changed client');
  });
});

async function sharedImagePdf(pages=3){
 const {PDFDocument,PDFName}=await import('pdf-lib');const doc=await PDFDocument.create(),images=[],originals=[];
 let seed=123456789;
 for(let page=0;page<pages;page++){
  const bytes=new Uint8Array(64*64*3);for(let i=0;i<bytes.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;bytes[i]=seed&255;}
  originals.push(bytes);images.push(doc.context.register(doc.context.stream(bytes,{Type:'XObject',Subtype:'Image',Width:64,Height:64,ColorSpace:'DeviceRGB',BitsPerComponent:8})));
 }
 const shared=doc.context.obj(Object.fromEntries(images.map((ref,i)=>[`Image${i}`,ref])));
 for(let i=0;i<pages;i++){const page=doc.addPage([200,200]);page.node.set(PDFName.of('Resources'),doc.context.obj({XObject:shared}));page.node.set(PDFName.of('Contents'),doc.context.register(doc.context.flateStream(`q 64 0 0 64 0 0 cm /Image${i} Do Q`)));}
 return {bytes:await doc.save(),originals};
}
it('removes unused shared images before splitting instead of falsely rejecting a single page',async()=>{
 const {PDFDict,decodePDFRawStream}=await import('pdf-lib');const {bytes,originals}=await sharedImagePdf();
 const archive=await prepareMedicalArchive(bytes,{maxPartBytes:16*1024});expect(archive.parts).toHaveLength(3);expect(archive.convertedPages).toEqual([]);
 for(let i=0;i<3;i++){
  const result=await PDFDocument.load(archive.parts[i].bytes),page=result.getPages()[0],objects=page.node.Resources().lookup(PDFName.of('XObject'),PDFDict);
  expect(objects.entries()).toHaveLength(1);const image=result.context.lookup(objects.entries()[0][1]);expect(decodePDFRawStream(image).getBytes()).toEqual(originals[i]);
 }
});
it('offers an explicitly reviewed smaller-copy fallback with separate upload-set identity when a real page remains oversized',async()=>{
 const {bytes}=await sharedImagePdf(1);const smaller=await pdf(1),render=vi.fn(async()=>smaller);
 await expect(prepareMedicalArchive(bytes,{maxPartBytes:4096})).rejects.toMatchObject({code:'MEDICAL_ARCHIVE_PAGE_TOO_LARGE',pageNumber:1});
 const archive=await prepareMedicalArchive(bytes,{maxPartBytes:4096,renderOversizedPage:render});
 expect(render).toHaveBeenCalledWith(bytes,1,4096);expect(archive.convertedPages).toEqual([1]);expect(archive.archiveSetId).not.toBe(archive.sourceHash);expect(archive.parts[0].bytes).toBe(smaller);
 const retry=await prepareMedicalArchive(bytes,{maxPartBytes:4096,renderOversizedPage:render});expect(retry.archiveSetId).toBe(archive.archiveSetId);
});
it('never drops image resources from annotated pages that may use them in stamp appearances',async()=>{
 const {compactMedicalPdf}=await import('../medicalArchivePdfResources.js'),{PDFDict}=await import('pdf-lib');const {bytes}=await sharedImagePdf();const source=await PDFDocument.load(bytes),page=source.getPages()[0];
 page.node.set(PDFName.of('Annots'),source.context.obj([source.context.register(source.context.obj({Type:'Annot',Subtype:'Stamp',Rect:[0,0,10,10]}))]));
 compactMedicalPdf(source);expect(page.node.Resources().lookup(PDFName.of('XObject'),PDFDict).entries()).toHaveLength(3);
});
