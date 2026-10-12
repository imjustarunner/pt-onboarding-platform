import {describe,it,expect,vi} from 'vitest';
import {PDFDocument} from 'pdf-lib';
vi.mock('../packetBrandChrome.service.js',()=>({resolvePacketBrandChrome:vi.fn(async()=>({}))}));
import {buildReferenceReleasePdfBuffer} from '../referenceReleasePdf.service.js';
import {resolvePacketBrandChrome} from '../packetBrandChrome.service.js';
describe('reference release document',()=>{
 it('creates the authorization even with no references and resolves the selected agency brand',async()=>{
  const agency={id:7,name:'Sample Agency'};
  const pdf=await PDFDocument.load(await buildReferenceReleasePdfBuffer({agency,agencyName:agency.name,applicantName:'Alex Demo',references:[]}));
  expect(pdf.getPageCount()).toBe(1);expect(resolvePacketBrandChrome).toHaveBeenCalledWith(agency);
 });
 it('paginates a long reference list instead of clipping content',async()=>{
  const pdf=await PDFDocument.load(await buildReferenceReleasePdfBuffer({agencyName:'Sample Agency',references:Array.from({length:45},(_,i)=>({name:`Example Reference ${i}`,email:`person${i}@example.test`,organization:'Sample Organization'}))}));
  expect(pdf.getPageCount()).toBeGreaterThan(1);expect(pdf.getPages().every(p=>p.getHeight()===792)).toBe(true);
 });
});
