import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../models/Client.model.js',()=>({default:{}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{}}));
vi.mock('../../models/ClientPhiDocument.model.js',()=>({default:{}}));
vi.mock('../../models/Agency.model.js',()=>({default:{}}));
vi.mock('../paperPacketVision.service.js',()=>({getLatestPaperPacketVisionEval:vi.fn()}));
vi.mock('../messagesHub.service.js',()=>({sendHubPortalInvitation:vi.fn()}));
vi.mock('../clientOnboardingChecklist.service.js',()=>({markPaperPacketSignatureReceived:vi.fn(),updateClientOnboardingDocs:vi.fn(),acknowledgeRoiStaffOnboarding:vi.fn()}));
import {compareAndSetPaperProcessingState,savePaperProcessingStep,completePaperProcessing,paperProcessingContext,paperProcessingSourceDocument,paperProcessingState,PAPER_PROCESSING_STEPS} from '../paperPacketProcessing.service.js';
let client,deps,connection;
const input={clientId:4,actorId:8,signaturesConfirmed:true,staffRoiConfirmed:true};
const ready=()=>{client.onboarding_docs_json={items:[{key:'roi',status:'missing'}],paperProcessing:{completedSteps:[...PAPER_PROCESSING_STEPS],documentId:9,guardian1Id:20,guardian2Id:21,sharedCustody:'yes',invitations:{}}};};
beforeEach(()=>{
 client={id:4,agency_id:2,organization_id:3,source:'SCHOOL_UPLOAD',full_name:'Synthetic Student',onboarding_docs_json:{items:[{key:'roi',status:'missing'}]}};
 connection={execute:vi.fn(async()=>[[{acquired:1}]]),release:vi.fn()};
 deps={clients:{findById:vi.fn(async()=>({...client})),update:vi.fn(async(id,patch)=>{Object.assign(client,patch);})},
 guardians:{getLink:vi.fn(async()=>({access_enabled:1})),listForClient:vi.fn(async()=>[{guardian_user_id:20,first_name:'Synthetic',email:'first@example.com',password_hash:'must-not-return'}])},
 documents:{findSchoolPaperPacket:vi.fn(async()=>({id:9,client_id:4,agency_id:2,school_organization_id:3,referral_draft_id:3,scan_status:'clean'})),findSchoolPaperPacketsForClient:vi.fn(async()=>[])},agencies:{findById:vi.fn(async()=>({name:'Example School'}))},
 versions:vi.fn(async()=>({id:70,version_label:'1.02'})),staff:{setAccessState:vi.fn(),listSchoolStaffRosterForClient:vi.fn(async()=>[{school_staff_user_id:99,effective_access_state:'packet'}])},
 vision:vi.fn(async()=>({id:11,phi_document_id:9,status:'applied',roi_signature_detected:1,disclosure_signature_detected:1,detected_version_label:'2026-08-20',raw_ocr:'private-text'})),
 send:vi.fn(async({guardianUserId})=>({delivery:{id:`email-${guardianUserId}`}})),markSignatures:vi.fn(),markDocuments:vi.fn(),acknowledgeRoi:vi.fn(),
 database:{getConnection:vi.fn(async()=>connection),execute:vi.fn(async()=>[[{id:7}]])}};
});
it('saves resumable steps without losing checklist metadata or sending an invitation',async()=>{
 await savePaperProcessingStep({clientId:4,actorId:8,step:'demographics',data:{documentId:9,firstName:'Synthetic',lastName:'Student',dateOfBirth:'2018-01-02'}},deps);
 expect(client.date_of_birth).toBe('2018-01-02');expect(JSON.parse(client.onboarding_docs_json).items).toHaveLength(1);
 expect(paperProcessingState(client)).toMatchObject({completedSteps:['demographics'],documentId:9});expect(deps.send).not.toHaveBeenCalled();expect(connection.release).toHaveBeenCalled();
});
it('sends distinct invitations once and retains the uploaded signatures as evidence',async()=>{
 ready();const state=await completePaperProcessing(input,deps);
 expect(deps.send.mock.calls.map(([p])=>p.guardianUserId)).toEqual([20,21]);expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({existingLinkOnly:true,paperPacketProcessed:true}));
 expect(state).toMatchObject({signatureSourceDocumentId:9,packetEvaluationId:11,invitations:{20:{status:'sent'},21:{status:'sent'}}});
 await completePaperProcessing({...input,signaturesConfirmed:false,staffRoiConfirmed:false},deps);expect(deps.send).toHaveBeenCalledTimes(2);expect(deps.markSignatures).toHaveBeenCalledTimes(1);
});
it('retries only failed recipients, never the successful parent',async()=>{
 ready();deps.send.mockResolvedValueOnce({delivery:{id:'first'}}).mockRejectedValueOnce(new Error('transport unavailable'));
 expect((await completePaperProcessing(input,deps)).invitations[21].status).toBe('failed');await completePaperProcessing(input,deps);expect(deps.send.mock.calls.map(([p])=>p.guardianUserId)).toEqual([20,21,21]);
});
it.each([[{queued:true},'queued'],[{pendingApproval:true},'queued'],[{skipped:true},'blocked'],[{redirected:true,id:4},'redirected'],[{},'unconfirmed']])('reports actual delivery outcome %j',async(delivery,status)=>{
 ready();deps.send.mockResolvedValue({delivery});expect((await completePaperProcessing(input,deps)).invitations[20].status).toBe(status);
 if(status!=='blocked'){await completePaperProcessing(input,deps);expect(deps.send).toHaveBeenCalledTimes(2);}
});
it.each([{client_id:40},{agency_id:20},{scan_status:'pending'},{removed_at:'2026-11-07'}])('rejects another chart or unavailable evidence %j',async(patch)=>{
 ready();deps.documents.findSchoolPaperPacket.mockResolvedValue({id:9,client_id:4,agency_id:2,school_organization_id:3,scan_status:'clean',...patch});await expect(completePaperProcessing(input,deps)).rejects.toMatchObject({status:400});expect(deps.send).not.toHaveBeenCalled();
});
it.each([{status:'needs_review'},{phi_document_id:10},{roi_signature_detected:0},{disclosure_signature_detected:0}])('keeps unverified signatures or matches pending %j',async(patch)=>{
 ready();deps.vision.mockResolvedValue({id:11,phi_document_id:9,status:'applied',roi_signature_detected:1,disclosure_signature_detected:1,...patch});await expect(completePaperProcessing(input,deps)).rejects.toMatchObject({status:400});expect(deps.markSignatures).not.toHaveBeenCalled();expect(deps.send).not.toHaveBeenCalled();
});
it('requires all steps, clarified custody and a distinct second parent when shared',async()=>{
 await expect(completePaperProcessing(input,deps)).rejects.toThrow('each packet-processing step');
 for(const patch of [{guardian2Id:null},{sharedCustody:'unsure'},{guardian2Id:20}]){ready();Object.assign(client.onboarding_docs_json.paperProcessing,patch);await expect(completePaperProcessing(input,deps)).rejects.toMatchObject({status:400});}expect(deps.send).not.toHaveBeenCalled();
});
it('never invites a disabled contact',async()=>{
 ready();deps.guardians.getLink.mockResolvedValue({access_enabled:0});expect((await completePaperProcessing(input,deps)).invitations[20].status).toBe('blocked');expect(deps.send).not.toHaveBeenCalled();
});
it('serializes saves and completion so concurrent requests cannot send',async()=>{
 ready();connection.execute.mockResolvedValue([[{acquired:0}]]);await expect(completePaperProcessing(input,deps)).rejects.toMatchObject({status:409});await expect(savePaperProcessingStep({clientId:4,step:'school'},deps)).rejects.toMatchObject({status:409});expect(deps.send).not.toHaveBeenCalled();expect(connection.release).toHaveBeenCalledTimes(2);
});
it('returns review context without account secrets or raw OCR',async()=>{
 const context=await paperProcessingContext(4,deps);expect(context.schoolName).toBe('Example School');expect(context.guardians[0]).not.toHaveProperty('password_hash');expect(context.packetRead).not.toHaveProperty('raw_ocr');
});
it('rejects invalid dates and requires consent review without erasing previously entered replacement data',async()=>{
 ready();await expect(savePaperProcessingStep({clientId:4,step:'demographics',data:{documentId:9,firstName:'Test',lastName:'Student',dateOfBirth:'2018-02-31'}},deps)).rejects.toThrow('valid date');
 deps.documents.findSchoolPaperPacket.mockResolvedValue({id:10,client_id:4,agency_id:2,school_organization_id:3,referral_draft_id:3,scan_status:'clean'});
 expect((await savePaperProcessingStep({clientId:4,step:'demographics',data:{documentId:10,firstName:'Test',lastName:'Student',dateOfBirth:'2018-02-28'}},deps)).completedSteps).not.toContain('consents');
});

it('limits the support processing context to this client’s uploaded referral packets',async()=>{
 const packet={id:9,client_id:4,agency_id:2,school_organization_id:3,referral_draft_id:3,original_name:'paper.pdf',scan_status:'clean',storage_path:'private',encryption_key_id:'private-key'};
 deps.documents.findSchoolPaperPacketsForClient.mockResolvedValue([packet,{...packet,id:10,client_id:5},{...packet,id:11,agency_id:8},{...packet,id:12,referral_draft_id:null,document_type:'clinical_note'},{...packet,id:13,removed_at:'2026-11-08'},{...packet,id:14,school_organization_id:30}]);
 const result=await paperProcessingContext(4,deps);
 expect(result.documents).toEqual([{id:9,original_name:'paper.pdf',mime_type:undefined,scan_status:'clean'}]);
});

it.each([{client_id:5},{agency_id:7},{referral_draft_id:null},{scan_status:'pending'},{scan_status:'infected'},{removed_at:'2026-11-08'}])('rejects a foreign, clinical or unavailable source document: %j',async change=>{
 deps.documents.findSchoolPaperPacket.mockResolvedValue({id:9,client_id:4,agency_id:2,school_organization_id:3,referral_draft_id:3,scan_status:'clean',...change});
 await expect(paperProcessingSourceDocument(4,9,deps)).rejects.toThrow('Select the uploaded packet');
});

it('permits an explicitly reviewed, fully matched replacement without resending successful invitations',async()=>{
 ready();client.onboarding_docs_json.paperPacketSource={documentId:9};
 client.onboarding_docs_json.paperProcessing.invitations={20:{status:'sent'},21:{status:'queued'}};
 deps.vision.mockResolvedValue({id:12,phi_document_id:9,status:'needs_review',roi_signature_detected:1,disclosure_signature_detected:1,review_reasons:['replacement_packet_requires_review']});
 await expect(completePaperProcessing({...input,signaturesConfirmed:false},deps)).rejects.toThrow('Confirm');
 const state=await completePaperProcessing(input,deps);expect(state.signatureSourceDocumentId).toBe(9);expect(deps.send).not.toHaveBeenCalled();
});
it.each(['signature_matching_needs_review','roi_signature_missing','deny_checkbox_ambiguous'])('keeps an uncertain replacement pending: %s',async reason=>{
 ready();client.onboarding_docs_json.paperPacketSource={documentId:9};
 deps.vision.mockResolvedValue({id:12,phi_document_id:9,status:'needs_review',roi_signature_detected:1,disclosure_signature_detected:1,review_reasons:['replacement_packet_requires_review',reason]});
 await expect(completePaperProcessing(input,deps)).rejects.toThrow('match needs review');expect(deps.markSignatures).not.toHaveBeenCalled();expect(deps.send).not.toHaveBeenCalled();
});
it('returns the stored guardian phone alias to the paper entry form',async()=>{
 deps.guardians.listForClient.mockResolvedValue([{guardian_user_id:20,phone:'555-0101'}]);
 expect((await paperProcessingContext(4,deps)).guardians[0].phone_number).toBe('555-0101');
});
it('requires review of a replacement while preserving saved contacts and insurance steps',async()=>{
 ready();const saved=client.onboarding_docs_json.paperProcessing;saved.documentId=7;saved.consentReview={documentId:7};
 await savePaperProcessingStep({clientId:4,actorId:8,step:'demographics',data:{documentId:9,firstName:'Synthetic',lastName:'Student',dateOfBirth:'2018-01-02'}},deps);
 const state=paperProcessingState(client);expect(state.completedSteps).toContain('insurance');expect(state.completedSteps).not.toContain('consents');expect(state.guardian2Id).toBe(21);expect(state.consentReview).toBeNull();
 await expect(completePaperProcessing(input,deps)).rejects.toThrow('each packet-processing step');expect(deps.send).not.toHaveBeenCalled();
 await savePaperProcessingStep({clientId:4,actorId:8,step:'consents',data:{signaturesConfirmed:true,staffRoiConfirmed:true,evidenceReview:humanReview()}},deps);
 expect(paperProcessingState(client).consentReview.documentId).toBe(9);
});
it('keeps previously processed five-step packets idempotent after adding a consent review step',async()=>{
 ready();Object.assign(client.onboarding_docs_json.paperProcessing,{completedSteps:PAPER_PROCESSING_STEPS.filter(s=>s!=='consents'),processedAt:'2026-11-08',invitations:{20:{status:'sent'},21:{status:'redirected'}}});
 await completePaperProcessing(input,deps);expect(deps.send).not.toHaveBeenCalled();
});

const humanReview=()=>({documentId:9,evaluationId:11,versionLabel:'1.02',locale:'en',sourceViewed:true,denyReviewed:true,roi:{status:'present',signerName:'Synthetic Parent',signedDate:'2026-11-12',page:5},disclosure:{status:'present',signerName:'Synthetic Parent',signedDate:'2026-11-12',page:6}});
it('records explicit human evidence for missed OCR signatures without altering Vision or creating a new signature',async()=>{
 ready();client.onboarding_docs_json.paperProcessing.completedSteps=PAPER_PROCESSING_STEPS.filter(s=>s!=='consents');
 const vision={id:11,phi_document_id:9,status:'needs_review',roi_signature_detected:0,disclosure_signature_detected:0,review_reasons:['roi_signature_missing','disclosure_signature_missing']};deps.vision.mockResolvedValue(vision);
 const evidence=humanReview();evidence.roi.signedDate='2026-11-09';const state=await savePaperProcessingStep({clientId:4,actorId:8,step:'consents',data:{signaturesConfirmed:true,staffRoiConfirmed:true,evidenceReview:evidence}},deps);
 expect(state.consentReview).toMatchObject({kind:'human_source_review',documentId:9,evaluationId:11,versionId:70,reviewedByUserId:8,roi:{signedDate:'2026-11-09',page:5},staffSelections:[{schoolStaffUserId:99,name:null,state:'packet'}]});expect(client.roi_expires_at).toBe('2029-11-09');expect(vision.roi_signature_detected).toBe(0);expect(deps.markSignatures).not.toHaveBeenCalled();
 await completePaperProcessing(input,deps);expect(deps.markSignatures).toHaveBeenCalledWith(expect.objectContaining({packetVersionLabel:'1.02'}));
});
it.each([{documentId:10},{evaluationId:12},{sourceViewed:false},{denyReviewed:false},{roi:{status:'uncertain'}},{disclosure:{status:'missing'}},{roi:{status:'present',signerName:'Parent',signedDate:'2026-02-31',page:5}}])('rejects stale, unviewed, missing or uncertain manual evidence: %j',async patch=>{ready();deps.vision.mockResolvedValue({id:11,phi_document_id:9,status:'needs_review'});await expect(savePaperProcessingStep({clientId:4,actorId:8,step:'consents',data:{signaturesConfirmed:true,staffRoiConfirmed:true,evidenceReview:{...humanReview(),...patch}}},deps)).rejects.toHaveProperty('status');expect(deps.send).not.toHaveBeenCalled();});
it('requires an actual printed version matching this school and keeps a newer evaluation pending',async()=>{ready();deps.versions.mockResolvedValue(null);await expect(savePaperProcessingStep({clientId:4,actorId:8,step:'consents',data:{signaturesConfirmed:true,staffRoiConfirmed:true,evidenceReview:humanReview()}},deps)).rejects.toThrow('printed packet version');deps.versions.mockResolvedValue({id:70,version_label:'1.02'});await savePaperProcessingStep({clientId:4,actorId:8,step:'consents',data:{signaturesConfirmed:true,staffRoiConfirmed:true,evidenceReview:humanReview()}},deps);deps.vision.mockResolvedValue({id:12,phi_document_id:9,status:'needs_review',roi_signature_detected:0});await expect(completePaperProcessing(input,deps)).rejects.toThrow('match needs review');expect(deps.send).not.toHaveBeenCalled();});
it('saves working entries in a PHI-encrypted envelope without approving steps, creating contacts or sending',async()=>{
 process.env.CLIENT_PHI_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,4).toString('base64');
 await savePaperProcessingStep({clientId:4,actorId:8,step:'draft',data:{documentId:9,evaluationId:11,expectedDraftRevision:0,stage:0,demographics:{preferred_language:'UNSAVED-RELOAD-PROBE'}}},deps);
 expect(JSON.stringify(client.onboarding_docs_json)).not.toContain('UNSAVED-RELOAD-PROBE');const context=await paperProcessingContext(4,deps);expect(context.workingDraft.demographics.preferred_language).toBe('UNSAVED-RELOAD-PROBE');expect(context.state).not.toHaveProperty('workingDraftEnc');expect(context.state.completedSteps).toEqual([]);expect(deps.markSignatures).not.toHaveBeenCalled();expect(deps.send).not.toHaveBeenCalled();
 delete process.env.CLIENT_PHI_ENCRYPTION_KEY_BASE64;
});
it('rejects a stale autosave revision, changed source, or changed evaluation',async()=>{
 ready();client.onboarding_docs_json.paperPacketSource={documentId:10};
 for(const data of[{documentId:9,evaluationId:11,expectedDraftRevision:0},{documentId:10,evaluationId:12,expectedDraftRevision:0},{documentId:9,evaluationId:11,expectedDraftRevision:99}])await expect(savePaperProcessingStep({clientId:4,actorId:8,step:'draft',data},deps)).rejects.toHaveProperty('status',409);
});
it('atomically updates only current child/source/revision metadata and rejects a lost comparison',async()=>{
 const execute=vi.fn(async()=>[{affectedRows:0}]),state={documentId:9,workingDraftRevision:2};await expect(compareAndSetPaperProcessingState({clientId:4,agencyId:2,schoolId:3,sourceId:9,expectedRevision:1,state},{execute})).rejects.toHaveProperty('status',409);
 const [sql,args]=execute.mock.calls[0];expect(sql).toContain("'$.paperProcessing'");expect(sql).toContain('WHERE id=? AND agency_id=?');expect(sql).toContain("'$.paperPacketSource.documentId'");expect(sql).toContain("'$.paperProcessing.workingDraftRevision'");expect(args).toEqual([JSON.stringify(state),null,4,2,3,9,9,1]);
});

it('allows historical school packet viewing but rejects applying or autosaving it under a different school',async()=>{
 ready();deps.documents.findSchoolPaperPacket.mockResolvedValue({id:9,client_id:4,agency_id:2,school_organization_id:30,referral_draft_id:3,scan_status:'clean'});
 expect((await paperProcessingSourceDocument(4,9,deps)).id).toBe(9);
 await expect(completePaperProcessing(input,deps)).rejects.toHaveProperty('status',400);
 await expect(savePaperProcessingStep({clientId:4,actorId:8,step:'draft',data:{documentId:9,evaluationId:11,expectedDraftRevision:0}},deps)).rejects.toHaveProperty('status',409);
 expect(deps.markSignatures).not.toHaveBeenCalled();expect(deps.send).not.toHaveBeenCalled();expect(deps.clients.update).not.toHaveBeenCalled();
});

it('does not resend a legacy unknown invitation on repeated Finish',async()=>{ready();client.onboarding_docs_json.paperProcessing.processedAt='2026-11-10T12:00:00Z';client.onboarding_docs_json.paperProcessing.invitations={20:{status:'unknown',attemptedAt:'2026-11-10T12:00:00Z'},21:{status:'sent',communicationId:88}};const original=structuredClone(client.onboarding_docs_json.paperProcessing.invitations);await completePaperProcessing({...input,signaturesConfirmed:false,staffRoiConfirmed:false},deps);expect(deps.send).not.toHaveBeenCalled();expect(deps.markSignatures).not.toHaveBeenCalled();expect(paperProcessingState(client).invitations).toEqual(original);});

it.each([{sourceViewed:false},{roi:{status:'uncertain'}},{versionLabel:''}])('never applies pending staff grants before human evidence is accepted: %j',async patch=>{ready();await expect(savePaperProcessingStep({clientId:4,actorId:8,step:'consents',data:{signaturesConfirmed:true,staffRoiConfirmed:true,staffChanges:[{schoolStaffUserId:99,nextState:'roi_docs'}],evidenceReview:{...humanReview(),...patch}}},deps)).rejects.toHaveProperty('status');expect(deps.staff.setAccessState).not.toHaveBeenCalled();expect(deps.clients.update).not.toHaveBeenCalled();});
it('applies only current-school staff changes after evidence acceptance and retains effective guardian restrictions',async()=>{ready();let state='packet';deps.staff.setAccessState.mockImplementation(async()=>{state='denied';});deps.staff.listSchoolStaffRosterForClient.mockImplementation(async()=>[{school_staff_user_id:99,effective_access_state:state}]);const result=await savePaperProcessingStep({clientId:4,actorId:8,step:'consents',data:{signaturesConfirmed:true,staffRoiConfirmed:true,staffChanges:[{schoolStaffUserId:99,nextState:'roi_docs'}],evidenceReview:humanReview()}},deps);expect(deps.staff.setAccessState).toHaveBeenCalledWith(expect.objectContaining({schoolStaffUserId:99,nextState:'roi_docs'}));expect(deps.staff.setAccessState.mock.calls[0][0]).not.toHaveProperty('skipGuardianPolicy');expect(result.consentReview.staffSelections[0].state).toBe('denied');});
it('rejects a staff ID outside the validated source school without changing permissions',async()=>{ready();await expect(savePaperProcessingStep({clientId:4,actorId:8,step:'consents',data:{signaturesConfirmed:true,staffRoiConfirmed:true,staffChanges:[{schoolStaffUserId:999,nextState:'roi_docs'}],evidenceReview:humanReview()}},deps)).rejects.toThrow('current school');expect(deps.staff.setAccessState).not.toHaveBeenCalled();});

it('never lets a stale Finish overwrite an authoritative replacement source',async()=>{ready();deps.markSignatures.mockImplementation(async()=>{client.onboarding_docs_json={paperPacketSource:{documentId:10},paperProcessing:{documentId:10,completedSteps:[],invitations:{20:{status:'sent'}}}};});await expect(completePaperProcessing(input,deps)).rejects.toHaveProperty('status',409);expect(paperProcessingState(client).documentId).toBe(10);expect(paperProcessingState(client).processedAt).toBeFalsy();expect(deps.send).not.toHaveBeenCalled();});
