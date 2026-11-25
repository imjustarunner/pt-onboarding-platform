vi.mock('../../services/coverageVerificationSummary.service.js',()=>({latestPayerResponses:vi.fn(async()=>({})),readCoverageVerificationSummary:vi.fn(async()=>({current:false,verifiedAt:null}))}));
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access:vi.fn(), read:vi.fn(), save:vi.fn(), importSection:vi.fn(), handoff:vi.fn(), insurance:vi.fn(), audit:vi.fn(),start:vi.fn(),finish:vi.fn(),prepareContactGuardian:vi.fn() }));
vi.mock('../../services/importedGuardianAccount.service.js',()=>({prepareImportedGuardianAccount:m.prepareContactGuardian}));
vi.mock('../../services/clientChartImportProgress.service.js',()=>({beginClientChartImport:m.start,completeClientChartImport:m.finish}));
vi.mock('../../services/clientChartImportAccess.service.js', () => ({ requireClientChartImportAccess:m.access }));
vi.mock('../../services/clientChartImport.service.js', () => ({ chartSections:['demographics','intake','plan','insurance','contacts','comments','payer','billingComments'], readChartRecord:m.read, saveChartRecord:m.save, importSupplementaryChartSection:m.importSection, handOffChartInsurance:m.handoff }));
vi.mock('../../services/clientInsurance.service.js', () => ({ readClientInsurance:m.insurance }));
vi.mock('../../services/auditEvent.service.js', () => ({ logAuditEvent:m.audit }));
import { getChartImportDraft, getChartImportDrafts, saveChartImportDraft, importChartSection, getChartSupplementaryRecords,startChartRecordsImport,finishChartRecordsImport,prepareChartContactGuardian } from '../clientChartImport.controller.js';
const req = () => ({ user:{ id:10, role:'support' }, params:{ id:12, section:'comments' }, query:{}, body:{ text:'Patient Comments\nSynthetic comment', revision:0, agencyId:999, userId:999 }, get:()=>'2' });
const res = () => ({ set:vi.fn().mockReturnThis(), json:vi.fn() });
it('prepares the second guardian only from the authorized chart and audit actor',async()=>{
 const request=req();request.params.affiliationId='51';request.body={actorUserId:999,guardianUserId:999,email:'ignore@example.test'};const response=res(),next=vi.fn();
 m.prepareContactGuardian.mockResolvedValue({portalAccount:{prepared:true,userId:40,invitationSent:false}});
 await prepareChartContactGuardian(request,response,next);
 expect(next).not.toHaveBeenCalled();expect(m.prepareContactGuardian).toHaveBeenCalledExactlyOnceWith({clientId:12,agencyId:2},51,10,null);
 expect(m.audit).toHaveBeenCalledWith(request,expect.objectContaining({actionType:'client_imported_guardian_account_prepared',metadata:{affiliationId:51,guardianUserId:40,invitationSent:false,accessGranted:false}}));
});
it('does not allow provider or out-of-agency account preparation',async()=>{
 const request=req();request.params.affiliationId='51';request.user.role='provider';let next=vi.fn();await prepareChartContactGuardian(request,res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.prepareContactGuardian).not.toHaveBeenCalled();
 request.user.role='support';m.access.mockRejectedValue(Object.assign(new Error('Outside agency'),{status:403}));next=vi.fn();await prepareChartContactGuardian(request,res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.prepareContactGuardian).not.toHaveBeenCalled();
});
beforeEach(() => { vi.resetAllMocks(); m.access.mockResolvedValue({ clientId:12, agencyId:2 }); m.read.mockResolvedValue({ value:null, revision:0 }); m.save.mockResolvedValue({ revision:1 }); m.importSection.mockResolvedValue({ message:'Synthetic comment' }); m.insurance.mockResolvedValue(null); });
it('loads drafts only for the authenticated user and authorized chart', async () => {
  const response=res(); await getChartImportDrafts(req(),response,vi.fn());
  expect(m.read).toHaveBeenCalledTimes(8);
  expect(m.read).toHaveBeenCalledWith({ clientId:12, agencyId:2 },'comments',10);
  expect(response.set).toHaveBeenCalledWith('Cache-Control','no-store');
});
it('saves revisioned drafts without accepting caller-selected owners or agencies', async () => {
  const request=req(); request.body.metadata={ sourceDate:'2025-01-02', sourceAuthor:'Source Author', imported:true };
  await saveChartImportDraft(request,res(),vi.fn());
  expect(m.save).toHaveBeenCalledWith({ clientId:12, agencyId:2 }, 'comments',10,{ text:request.body.text, sourceDate:'2025-01-02', sourceAuthor:'Source Author', imported:true, needsReview:false },10,0);
});
it('records the actual actor and section without including patient comments in audit metadata', async () => {
  await importChartSection(req(),res(),vi.fn());
  expect(m.importSection).toHaveBeenCalledWith({ clientId:12, agencyId:2 },'comments','Patient Comments\nSynthetic comment',10,{ position:'primary' });
  expect(m.audit.mock.calls[0][1]).toEqual({ actionType:'client_chart_section_imported', agencyId:2, targetType:'client', targetId:12, metadata:{ section:'comments' } });
});
it.each([getChartImportDraft,getChartImportDrafts,saveChartImportDraft,importChartSection,getChartSupplementaryRecords,startChartRecordsImport,finishChartRecordsImport])('checks access before any private read or write (%#)', async handler => {
  m.access.mockRejectedValue(Object.assign(new Error('Denied'),{ status:403 })); const next=vi.fn();
  await handler(req(),res(),next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status:403 }));
  expect(m.read).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled(); expect(m.insurance).not.toHaveBeenCalled(); expect(m.importSection).not.toHaveBeenCalled();
});
it('records progress only for the authorized chart and actual actor',async()=>{
 const request=req();request.body={sections:['demographics','comments'],actorId:999,agencyId:999};
 await startChartRecordsImport(request,res(),vi.fn());expect(m.start).toHaveBeenCalledWith({clientId:12,agencyId:2},['demographics','comments'],10);
 await finishChartRecordsImport(request,res(),vi.fn());expect(m.finish).toHaveBeenCalledWith({clientId:12,agencyId:2},10,expect.objectContaining({allowedSections:expect.arrayContaining(['insurance','demographics'])}));
 expect(JSON.stringify(m.audit.mock.calls)).not.toContain('Synthetic comment');
});
it('rejects oversized drafts and invalid revisions', async () => {
  for (const body of [{ text:'x'.repeat(200001), revision:0 }, { text:'text', revision:-1 }, { text:'text' }]) {
    const request=req(); request.body=body; const next=vi.fn(); await saveChartImportDraft(request,res(),next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ status:400 }));
  }
  expect(m.save).not.toHaveBeenCalled();
});
it('keeps primary and secondary draft text independent and validates each size',async()=>{
 const request=req();request.params.section='insurance';request.body={text:'Secondary draft',revision:0,metadata:{position:'secondary',coverageDrafts:{primary:{text:'Primary draft',imported:true},secondary:{text:'Secondary draft',imported:false}}}};
 await saveChartImportDraft(request,res(),vi.fn());
 expect(m.save).toHaveBeenCalledWith(expect.anything(),'insurance',10,expect.objectContaining({position:'secondary',coverageDrafts:{primary:{text:'Primary draft',imported:true},secondary:{text:'Secondary draft',imported:false}}}),10,0);
 request.body.metadata.coverageDrafts.primary.text='x'.repeat(200001);const next=vi.fn();await saveChartImportDraft(request,res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:400}));
});
it('requires account staff to prepare imported portal identities',async()=>{
 const request=req();request.user.role='provider';request.params.section='contacts';request.body.preparePrimaryGuardian=true;
 const next=vi.fn();await importChartSection(request,res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.importSection).not.toHaveBeenCalled();
});
it('gives providers a coverage summary without subscriber, payer or billing-comment details',async()=>{
 const request=req();request.user.role='provider';m.insurance.mockResolvedValue({primary:{insurerName:'Example',memberId:'PRIVATE',subscriberName:'Private Parent',copay:'20',isMedicaid:false}});
 const response=res();await getChartSupplementaryRecords(request,response,vi.fn());
 expect(response.json.mock.calls[0][0]).toMatchObject({insurance:{primary:{insurerName:'Example',isMedicaid:false,programType:''}},payer:null,billingComments:'',accountAccess:false});
 expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain('PRIVATE');expect(m.read).not.toHaveBeenCalledWith(expect.anything(),'billingComments');
});
it.each(['insurance','payer','billingComments'])('does not read or save providers’ billing import drafts (%s)',async section=>{
 const request=req();request.user.role='provider';request.params.section=section;const next=vi.fn();await saveChartImportDraft(request,res(),next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.save).not.toHaveBeenCalled();
 const response=res();await getChartImportDrafts(request,response,vi.fn());expect(response.json.mock.calls[0][0].drafts[section]).toBeUndefined();
});
it('saves pending assignments only as an owner-scoped encrypted draft and does not expose them as an importable record section',async()=>{
 const request=req();request.params.section='assignments';request.body={text:JSON.stringify({defaults:{officeId:'21',pos:'11'},services:null}),revision:0};
 await saveChartImportDraft(request,res(),vi.fn());expect(m.save).toHaveBeenCalledWith({clientId:12,agencyId:2},'assignments',10,expect.objectContaining({text:request.body.text,imported:false}),10,0);
 m.save.mockClear();request.user.role='provider';const next=vi.fn();await saveChartImportDraft(request,res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.save).not.toHaveBeenCalled();
 request.user.role='support';const imported=vi.fn();await importChartSection(request,res(),imported);expect(imported).toHaveBeenCalledWith(expect.objectContaining({status:400}));
});
it('reads only the authenticated account editor’s assignment draft without returning any other private section',async()=>{
 const request=req();request.params.section='assignments';request.query.userId=999;const response=res();
 await getChartImportDraft(request,response,vi.fn());
 expect(m.read.mock.calls).toEqual([[{clientId:12,agencyId:2},'assignments',10]]);
 expect(response.json).toHaveBeenCalledWith({draft:{value:null,revision:0}});expect(response.set).toHaveBeenCalledWith('Cache-Control','no-store');
 m.read.mockClear();request.user.role='provider';const next=vi.fn();await getChartImportDraft(request,res(),next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.read).not.toHaveBeenCalled();
});

it('opens only selected areas under the authenticated actor and protects billing areas',async()=>{
 const request=req();request.body={sections:[],selectedSections:['contacts','insurance']};
 await startChartRecordsImport(request,res(),vi.fn());expect(m.start).toHaveBeenCalledWith({clientId:12,agencyId:2},[],10,{selectedSections:['contacts','insurance']});
 m.start.mockClear();request.user.role='provider';const next=vi.fn();await startChartRecordsImport(request,res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.start).not.toHaveBeenCalled();
});

it('lets agency account staff hand off a policy without putting the paste in the audit trail', async () => {
 const request=req();request.params.section='insurance';
 request.body={text:'Synthetic original policy',position:'secondary',deferToBilling:true};
 const response=res(),next=vi.fn();m.handoff.mockResolvedValue({taskId:91});
 await importChartSection(request,response,next);
 expect(next).not.toHaveBeenCalled();
 expect(m.handoff).toHaveBeenCalledWith({clientId:12,agencyId:2},'secondary','Synthetic original policy',10);
 expect(m.audit.mock.calls[0][1]).toMatchObject({actionType:'client_chart_insurance_sent_to_billing',metadata:{position:'secondary',taskId:91}});
 expect(JSON.stringify(m.audit.mock.calls[0][1])).not.toContain(request.body.text);
 expect(response.json).toHaveBeenCalledWith({result:{taskId:91}});
 request.user.role='provider';
 const rejected=vi.fn();await importChartSection(request,res(),rejected);
 expect(rejected).toHaveBeenCalledWith(expect.objectContaining({status:403}));
 expect(m.handoff).toHaveBeenCalledOnce();
});
