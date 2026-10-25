import { expect, it, vi } from 'vitest';
vi.mock('../../middleware/auth.middleware.js',()=>({authenticate:(req,res,next)=>next(),requireActiveStatus:(req,res,next)=>next(),requireBackofficeAdmin:(req,res,next)=>next()}));
vi.mock('../../controllers/unassignedDocuments.controller.js',()=>Object.fromEntries([
  'listUnassignedDocuments','assignToClient','getGuardianClients','downloadDocument'
].map(name=>[name,(req,res)=>res.json({uploadedDocument:true})])));
vi.mock('../../middleware/rateLimiter.middleware.js',()=>({apiLimiter:(req,res,next)=>next()}));
vi.mock('../../controllers/contactDocumentation.controller.js',()=>({
  list:(req,res)=>res.json({contactNotes:true}),detail:(req,res)=>res.json({contactNotes:true}),save:(req,res)=>res.json({saved:true})
}));
vi.mock('../../controllers/clinicalNoteGenerator.controller.js',()=>Object.fromEntries([
  'getClinicalNotesContext','listClinicalNotePrograms','createConsentTask','createClinicalNoteDraft','patchClinicalNoteDraft',
  'listRecentClinicalNoteDrafts','archiveClinicalNoteDraft','deleteClinicalNoteDrafts','transcribeClinicalNoteAudio',
  'generateClinicalNote','generateInteractiveComplexitySentence','getTerminationOutcomeStats','recordNoteAidAudit'
].map(name=>[name,(req,res)=>res.json({clinicalContent:true})])));
vi.mock('../../controllers/noteAidWorkQueue.controller.js',()=>Object.fromEntries([
  'listNoteAidWorkQueue','syncNoteAidWorkQueue','appendNoteAidWorkQueue','patchNoteAidWorkQueueItem','deleteNoteAidWorkQueueItem','clearNoteAidWorkQueue'
].map(name=>[name,(req,res)=>res.json({clinicalContent:true})])));
import router from '../clinicalNoteGenerator.routes.js';
import uploadedDocumentsRouter from '../unassignedDocuments.routes.js';
function request(method,url,role='support', target=router) {
  return new Promise((resolve,reject)=>{
    const req={method,url,originalUrl:url,headers:{},query:{agencyId:'450'},body:{agencyId:450},user:{id:1434,role}};
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){resolve({status:this.statusCode,body});}};
    target.handle(req,res,error=>error?reject(error):resolve({status:404}));
  });
}
it.each([['GET','/context'],['GET','/recent'],['GET','/work-queue'],['POST','/drafts'],['PATCH','/drafts/7'],['POST','/generate']])('support cannot access clinical content through %s %s',async(method,path)=>{
  const result=await request(method,path);expect(result.status).toBe(403);expect(result.body.error.code).toBe('SUPPORT_CLINICAL_CONTENT_RESTRICTED');
});
it.each([['GET','/contact-documentation'],['GET','/contact-documentation/email/7'],['POST','/contact-documentation/email/7']])('operational contact documentation still reaches its own scope-checked handler: %s %s',async(method,path)=>{
  expect((await request(method,path)).status).toBe(200);
});
it('provider clinical context still reaches the existing authorization handler',async()=>{
  expect(await request('GET','/context','provider')).toMatchObject({status:200,body:{clinicalContent:true}});
});
it.each([['GET','/'],['GET','/7/download'],['GET','/7/guardian-clients'],['POST','/7/assign']])('support cannot read or reassign uploaded medical documents through %s %s',async(method,path)=>{
  const result=await request(method,path,'support',uploadedDocumentsRouter);
  expect(result.status).toBe(403);
  expect(result.body.error.code).toBe('SUPPORT_CLINICAL_CONTENT_RESTRICTED');
});
it('keeps uploaded-document administration behind the existing administrator checks',async()=>{
  expect(await request('GET','/','admin',uploadedDocumentsRouter)).toMatchObject({status:200,body:{uploadedDocument:true}});
});
