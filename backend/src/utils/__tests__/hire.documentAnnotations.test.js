import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { applyDocumentAnnotations, validateDocumentAnnotations } from '../pdfDocumentAnnotations.js';
import { sanitizePrehireConfig, mergePrehireDocuments } from '../prehireConfigSanitize.js';
import { assertHireFormReady } from '../hireDocumentFields.js';
const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZ8AAAAASUVORK5CYII=';
const entry = { kind: 'text', page: 1, x: 40, y: 50, width: 180, height: 35, fontSize: 14, text: 'Elena Cruz' };
const blankPdf = async () => { const pdf = await PDFDocument.create(); pdf.addPage([612,792]); return pdf; };
describe('candidate placed PDF entries', () => {
  it('flattens text, a checkmark and a visible signature into a saved, reloadable PDF with retained answers', async () => {
    const pdf = await blankPdf();
    const values = [entry, {...entry,kind:'check',x:240,width:18,height:18}, {...entry,kind:'signature',y:150,height:60}];
    expect(await applyDocumentAnnotations(pdf, values, signature)).toHaveLength(3);
    const restored = await PDFDocument.load(await pdf.save());
    expect(restored.getPageCount()).toBe(1);
    expect(restored.getPage(0).node.Contents()).toBeTruthy();
    expect(restored.getPage(0).node.Resources().toString()).toContain('Image');
    expect(restored.catalog.toString()).toContain('EmbeddedFiles');
  });
  it.each([{page:2},{x:-1},{width:900},{height:0},{fontSize:100},{kind:'script'},{text:''},{x:NaN}])('rejects invalid placement %o', async patch => {
    const pdf = await blankPdf();
    expect(() => validateDocumentAnnotations(pdf, [{...entry,...patch}])).toThrow();
  });
  it('rejects too many entries and text that would be lost to overflow', async () => {
    const pdf = await blankPdf();
    expect(() => validateDocumentAnnotations(pdf, Array(101).fill(entry))).toThrow('100');
    await expect(applyDocumentAnnotations(pdf, [{...entry,width:8,height:8,text:'This does not fit'}])).rejects.toThrow('Enlarge');
    await expect(applyDocumentAnnotations(pdf, [{...entry,kind:'signature'}])).rejects.toThrow('signature');
  });
});
describe('authored prehire documents', () => {
  it('retains formatted content and branding while stripping active content', () => {
    const doc = sanitizePrehireConfig({documents:[{id:'handbook',title:'Handbook acknowledgement',kind:'company_document',bodyHtml:'<h2>Handbook</h2><p onclick="bad()">I agree</p><script>bad()</script>',brandingMode:'letterhead',letterheadTemplateId:7}]}).documents[0];
    expect(doc.bodyHtml).toBe('<h2>Handbook</h2><p>I agree</p>'); expect(doc.letterheadTemplateId).toBe(7);
  });
  it('preserves agency defaults, job overrides and explicit exclusions without altering another job', () => {
    const defaults = {documents:[{id:'a',title:'Default A'},{id:'b',title:'Default B'},{id:'c',title:'Default C'}]};
    expect(mergePrehireDocuments({documents:[{id:'a',title:'Custom A'}],excludedDocumentIds:['b']},defaults).documents.map(d=>d.title)).toEqual(['Custom A','Default C']);
    expect(mergePrehireDocuments({},defaults).documents).toHaveLength(3);
  });
  it('allows flat PDF forms without mapped fields but rejects an unconfigured HTML form', () => {
    expect(() => assertHireFormReady({name:'W-4',template_type:'pdf',file_path:'forms/w4.pdf'})).not.toThrow();
    expect(() => assertHireFormReady({name:'W-4',template_type:'html'})).toThrow('Configure');
  });
});
