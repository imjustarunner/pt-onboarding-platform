import {describe,it,expect,vi,beforeEach} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {publishLegalDocument} from '../platformLegalDocuments.controller.js';
import Branding from '../../models/PlatformBranding.model.js';
import Storage from '../../services/storage.service.js';
vi.mock('../../models/PlatformBranding.model.js',()=>({default:{update:vi.fn()}}));
vi.mock('../../services/storage.service.js',()=>({default:{savePublicMarketingAsset:vi.fn()}}));
let req,res,next;
beforeEach(()=>{vi.clearAllMocks();req={user:{id:1,role:'super_admin'},params:{docType:'platformhipaa'},body:{url:'https://example.com/hipaa.pdf'}};res={status:vi.fn().mockReturnThis(),json:vi.fn()};next=vi.fn();Branding.update.mockResolvedValue({platform_hipaa_url:req.body.url});});
describe('platform legal document publishing',()=>{
 it('publishes only the requested document field with the acting administrator',async()=>{await publishLegalDocument(req,res,next);expect(Branding.update).toHaveBeenCalledWith({platformHipaaUrl:req.body.url},1);expect(next).not.toHaveBeenCalled();});
 it('does not allow tenant admins or visitors to replace platform documents',async()=>{for(const user of [null,{id:2,role:'admin'}]){req.user=user;await publishLegalDocument(req,res,next);expect(res.status).toHaveBeenCalledWith(403);}expect(Branding.update).not.toHaveBeenCalled();});
 it('rejects unknown document types and unsafe URLs',async()=>{
  for(const url of ['javascript:alert(1)','data:text/html,hi','ftp://example.com/doc','https://name:password@example.com/doc','']){req.body.url=url;await publishLegalDocument(req,res,next);expect(res.status).toHaveBeenCalledWith(400);}
  req.params.docType='constructor';await publishLegalDocument(req,res,next);expect(Branding.update).not.toHaveBeenCalled();
 });
 it('stores a validated PDF under a unique public asset name and publishes its URL',async()=>{
  const doc=await PDFDocument.create();doc.addPage();req.file={mimetype:'application/pdf',buffer:Buffer.from(await doc.save())};req.body={};Storage.savePublicMarketingAsset.mockResolvedValue({relativePath:'uploads/public_marketing/legal-test.pdf'});
  Branding.update.mockResolvedValue({platform_hipaa_url:'https://plottwisthq.com/uploads/public_marketing/legal-test.pdf'});await publishLegalDocument(req,res,next);expect(next).not.toHaveBeenCalled();expect(Storage.savePublicMarketingAsset).toHaveBeenCalledWith(req.file.buffer,expect.stringMatching(/^legal-platformhipaa-[\da-f-]+\.pdf$/),'application/pdf');expect(Branding.update).toHaveBeenCalledWith({platformHipaaUrl:'https://plottwisthq.com/uploads/public_marketing/legal-test.pdf'},1);
 });
 it('does not report publication if the database did not persist the setting',async()=>{Branding.update.mockResolvedValue({});await publishLegalDocument(req,res,next);expect(res.status).toHaveBeenCalledWith(409);});
 it('rejects fake PDFs and ambiguous upload-plus-link requests without publishing',async()=>{
  req.file={mimetype:'application/pdf',buffer:Buffer.from('%PDF-not a real document')};await publishLegalDocument(req,res,next);req.body={};await publishLegalDocument(req,res,next);expect(res.status).toHaveBeenCalledWith(400);expect(Storage.savePublicMarketingAsset).not.toHaveBeenCalled();expect(Branding.update).not.toHaveBeenCalled();
 });
});
