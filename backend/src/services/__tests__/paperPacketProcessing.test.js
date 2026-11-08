import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../models/Client.model.js',()=>({default:{}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{}}));
vi.mock('../../models/ClientPhiDocument.model.js',()=>({default:{}}));
vi.mock('../../models/Agency.model.js',()=>({default:{}}));
vi.mock('../paperPacketVision.service.js',()=>({getLatestPaperPacketVisionEval:vi.fn()}));
vi.mock('../messagesHub.service.js',()=>({sendHubPortalInvitation:vi.fn()}));
vi.mock('../clientOnboardingChecklist.service.js',()=>({markPaperPacketSignatureReceived:vi.fn(),updateClientOnboardingDocs:vi.fn(),acknowledgeRoiStaffOnboarding:vi.fn()}));
import {savePaperProcessingStep,completePaperProcessing,paperProcessingContext,paperProcessingSourceDocument,paperProcessingState,PAPER_PROCESSING_STEPS} from '../paperPacketProcessing.service.js';
let client,deps,connection;
const input={clientId:4,actorId:8,signaturesConfirmed:true,staffRoiConfirmed:true};
const ready=()=>{client.onboarding_docs_json={items:[{key:'roi',status:'missing'}],paperProcessing:{completedSteps:[...PAPER_PROCESSING_STEPS],documentId:9,guardian1Id:20,guardian2Id:21,sharedCustody:'yes',invitations:{}}};};
beforeEach(()=>{
 client={id:4,agency_id:2,organization_id:3,source:'SCHOOL_UPLOAD',full_name:'Synthetic Student',onboarding_docs_json:{items:[{key:'roi',status:'missing'}]}};
 connection={execute:vi.fn(async()=>[[{acquired:1}]]),release:vi.fn()};
 deps={clients:{findById:vi.fn(async()=>({...client})),update:vi.fn(async(id,patch)=>{Object.assign(client,patch);})},
 guardians:{getLink:vi.fn(async()=>({access_enabled:1})),listForClient:vi.fn(async()=>[{guardian_user_id:20,first_name:'Synthetic',email:'first@example.com',password_hash:'must-not-return'}])},
 documents:{findSchoolPaperPacket:vi.fn(async()=>({id:9,client_id:4,agency_id:2,referral_draft_id:3,scan_status:'clean'})),findSchoolPaperPacketsForClient:vi.fn(async()=>[])},agencies:{findById:vi.fn(async()=>({name:'Example School'}))},
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
 ready();deps.documents.findSchoolPaperPacket.mockResolvedValue({id:9,client_id:4,agency_id:2,scan_status:'clean',...patch});await expect(completePaperProcessing(input,deps)).rejects.toMatchObject({status:400});expect(deps.send).not.toHaveBeenCalled();
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
it('rejects invalid dates and requires all steps for a replacement packet',async()=>{
 ready();await expect(savePaperProcessingStep({clientId:4,step:'demographics',data:{documentId:9,firstName:'Test',lastName:'Student',dateOfBirth:'2018-02-31'}},deps)).rejects.toThrow('valid date');
 deps.documents.findSchoolPaperPacket.mockResolvedValue({id:10,client_id:4,agency_id:2,referral_draft_id:3,scan_status:'clean'});
 expect((await savePaperProcessingStep({clientId:4,step:'demographics',data:{documentId:10,firstName:'Test',lastName:'Student',dateOfBirth:'2018-02-28'}},deps)).completedSteps).toEqual(['demographics']);
});

it('limits the support processing context to this client’s uploaded referral packets',async()=>{
 const packet={id:9,client_id:4,agency_id:2,referral_draft_id:3,original_name:'paper.pdf',scan_status:'clean',storage_path:'private',encryption_key_id:'private-key'};
 deps.documents.findSchoolPaperPacketsForClient.mockResolvedValue([packet,{...packet,id:10,client_id:5},{...packet,id:11,agency_id:8},{...packet,id:12,referral_draft_id:null,document_type:'clinical_note'},{...packet,id:13,removed_at:'2026-11-08'}]);
 const result=await paperProcessingContext(4,deps);
 expect(result.documents).toEqual([{id:9,original_name:'paper.pdf',mime_type:undefined,scan_status:'clean'}]);
});

it.each([{client_id:5},{agency_id:7},{referral_draft_id:null},{scan_status:'pending'},{scan_status:'infected'},{removed_at:'2026-11-08'}])('rejects a foreign, clinical or unavailable source document: %j',async change=>{
 deps.documents.findSchoolPaperPacket.mockResolvedValue({id:9,client_id:4,agency_id:2,referral_draft_id:3,scan_status:'clean',...change});
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
