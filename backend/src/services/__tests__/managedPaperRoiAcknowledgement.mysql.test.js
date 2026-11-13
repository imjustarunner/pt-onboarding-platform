import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from './fixtures/isolatedWorkflowMysql.js';
vi.mock('../../config/database.js',()=>({onTableWrite:()=>()=>{},default:{execute:vi.fn()}}));
vi.mock('../auditEvent.service.js',()=>({logAuditEvent:vi.fn()}));
import {acknowledgeReviewedPaperRoi} from '../managedPaperRoiAcknowledgement.service.js';
describe.runIf(recoveryMysqlEnabled)('managed paper ROI acknowledgment actual source CAS',()=>{
 let fixture,db,client,review;const audit=vi.fn();
 beforeAll(async()=>{fixture=await isolatedWorkflowMysql('managed_paper_roi');db=fixture.db;
  await db.query('CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,organization_id INT,onboarding_docs_json JSON,paper_packet_staff_roi_pending BOOLEAN DEFAULT TRUE,roi_expires_at DATE,guardian_portal_enabled BOOLEAN DEFAULT FALSE,updated_by_user_id INT,updated_at DATETIME)');
  await db.query('CREATE TABLE client_phi_documents(id INT PRIMARY KEY,client_id INT,agency_id INT,school_organization_id INT,scan_status VARCHAR(20),removed_at DATETIME)');
  await db.query('CREATE TABLE client_paper_packet_vision_evals(id INT PRIMARY KEY,client_id INT,school_organization_id INT,phi_document_id INT)');
 });afterAll(async()=>{await fixture?.close();});
 beforeEach(async()=>{audit.mockReset();await db.query('DELETE FROM clients');await db.query('DELETE FROM client_phi_documents');await db.query('DELETE FROM client_paper_packet_vision_evals');
  review={kind:'human_source_review',documentId:4470,evaluationId:208,versionId:8,reviewedAt:'2026-11-13T01:00:00.000Z',reviewedByUserId:1434,roiExpiresAt:'2029-11-12',sourceViewed:true,denyReviewed:true,roi:{status:'present',signerName:'Fictional Parent',signedDate:'2026-11-12'},disclosure:{status:'present',signerName:'Fictional Parent',signedDate:'2026-11-12'}};
  client={id:2553,agency_id:450,organization_id:451,onboarding_docs_json:{paperPacketSource:{documentId:4470,draftId:230},paperProcessing:{documentId:4470,completedSteps:['consents'],consentReview:review}}};
  await db.execute('INSERT INTO clients(id,agency_id,organization_id,onboarding_docs_json,roi_expires_at) VALUES(2553,450,451,?,?)',[JSON.stringify(client.onboarding_docs_json),'2029-11-01']);
  await db.query("INSERT INTO client_phi_documents VALUES(4470,2553,450,451,'clean',NULL)");await db.query('INSERT INTO client_paper_packet_vision_evals VALUES(208,2553,451,4470)');
 });
 const acknowledge=extra=>acknowledgeReviewedPaperRoi({client,actorUserId:1434,...extra},db,audit);
 async function pending(){const[[r]]=await db.query('SELECT paper_packet_staff_roi_pending AS pending,CAST(roi_expires_at AS CHAR) AS expiry FROM clients WHERE id=2553');return r;}
 it('accepts the stored reviewed current source and keeps expiry derived from its signed paper',async()=>{expect(await acknowledge()).toBe(true);expect(await pending()).toEqual({pending:0,expiry:'2029-11-12'});expect(audit).toHaveBeenCalledOnce();});
 it('does not turn an arbitrary expiry or missing reviewed evidence into permission',async()=>{await expect(acknowledge({roiExpiresAt:'2099-01-01'})).rejects.toMatchObject({status:409});delete client.onboarding_docs_json.paperProcessing.consentReview;await expect(acknowledge()).rejects.toMatchObject({status:409});expect((await pending()).pending).toBe(1);expect(audit).not.toHaveBeenCalled();});
 it.each([
  ['replacement',"UPDATE clients SET onboarding_docs_json=JSON_SET(onboarding_docs_json,'$.paperPacketSource.documentId',4471) WHERE id=2553"],
  ['new evaluation','INSERT INTO client_paper_packet_vision_evals VALUES(209,2553,451,4470)'],
  ['removed source',"UPDATE client_phi_documents SET removed_at=UTC_TIMESTAMP() WHERE id=4470"],
  ['unscanned source',"UPDATE client_phi_documents SET scan_status='pending' WHERE id=4470"],
  ['other child','UPDATE client_phi_documents SET client_id=2554 WHERE id=4470'],
  ['other school','UPDATE client_phi_documents SET school_organization_id=452 WHERE id=4470'],
  ['revoked review',"UPDATE clients SET onboarding_docs_json=JSON_SET(onboarding_docs_json,'$.paperProcessing.consentReview.denyReviewed',FALSE) WHERE id=2553"],
  ['changed reviewer',"UPDATE clients SET onboarding_docs_json=JSON_SET(onboarding_docs_json,'$.paperProcessing.consentReview.reviewedAt','2026-11-13T02:00:00.000Z') WHERE id=2553"]
 ])('cannot clear pending from stale %s state',async(_reason,sql)=>{await db.query(sql);await expect(acknowledge()).rejects.toMatchObject({status:409});expect((await pending()).pending).toBe(1);expect(audit).not.toHaveBeenCalled();});
 it('leaves the separate old manual workflow to its existing handler',async()=>{client.onboarding_docs_json={};expect(await acknowledge()).toBe(false);expect((await pending()).pending).toBe(1);});
 it('saves the real consent step before normal Finish reloads and executes the real source acknowledgment guard',async()=>{
  const {savePaperProcessingStep,completePaperProcessing}=await import('../paperPacketProcessing.service.js');
  const state=client.onboarding_docs_json.paperProcessing;state.completedSteps=['demographics','guardian1','guardian2','school','insurance'];state.guardian1Id=20;state.guardian2Id=null;state.sharedCustody='no';state.invitations={};delete state.consentReview;
  await db.execute('UPDATE clients SET onboarding_docs_json=? WHERE id=2553',[JSON.stringify(client.onboarding_docs_json)]);
  const clients={findById:async id=>{const[[row]]=await db.execute('SELECT * FROM clients WHERE id=?',[id]);return row;},update:async(id,patch)=>{const allowed=['onboarding_docs_json','roi_expires_at','guardian_portal_enabled'];const entries=Object.entries(patch);if(entries.some(([key])=>!allowed.includes(key)))throw Error('Unexpected fixture write');await db.execute(`UPDATE clients SET ${entries.map(([key])=>`${key}=?`).join(',')} WHERE id=?`,[...entries.map(([,value])=>value),id]);}};
  const send=vi.fn(async()=>({delivery:{id:'isolated-test-receipt'}})),ackSnapshots=[];
  const deps={database:db,clients,documents:{findSchoolPaperPacket:async()=>({id:4470,client_id:2553,agency_id:450,school_organization_id:451,referral_draft_id:230,scan_status:'clean'})},vision:async()=>({id:208,phi_document_id:4470,status:'needs_review',review_reasons:['replacement_packet_requires_review']}),versions:async()=>({id:8,version_label:'1.02'}),staff:{listSchoolStaffRosterForClient:async()=>[{school_staff_user_id:99,first_name:'Fictional',last_name:'Staff',effective_access_state:'roi_docs'}]},guardians:{getLink:async()=>({access_enabled:1})},markSignatures:async()=>{},markDocuments:async()=>{await db.execute("UPDATE clients SET onboarding_docs_json=JSON_SET(onboarding_docs_json,'$.roi','present') WHERE id=2553");},acknowledgeRoi:async({clientId,actorUserId})=>{const fresh=await clients.findById(clientId);ackSnapshots.push(fresh.onboarding_docs_json.paperProcessing);return acknowledgeReviewedPaperRoi({client:fresh,actorUserId},db,audit);},send};
  await savePaperProcessingStep({clientId:2553,actorId:1434,step:'consents',data:{signaturesConfirmed:true,staffRoiConfirmed:true,evidenceReview:{...review,versionLabel:'1.02',locale:'en',documentId:4470,evaluationId:208,roi:{...review.roi,page:5},disclosure:{...review.disclosure,page:6}}}},deps);
  const before=await clients.findById(2553);expect(before.onboarding_docs_json.paperProcessing.completedSteps).toContain('consents');expect(before.onboarding_docs_json.paperProcessing.consentReview.documentId).toBe(4470);
  const completed=await completePaperProcessing({clientId:2553,actorId:1434,signaturesConfirmed:true,staffRoiConfirmed:true},deps);
  expect(ackSnapshots).toHaveLength(1);expect(ackSnapshots[0].completedSteps).toContain('consents');expect(ackSnapshots[0].consentReview).toMatchObject({kind:'human_source_review',documentId:4470,evaluationId:208,reviewedByUserId:1434});expect(completed.processedAt).toBeTruthy();expect(completed.signatureSourceDocumentId).toBe(4470);expect(completed.invitations[20].status).toBe('sent');expect((await pending()).pending).toBe(0);expect(send).toHaveBeenCalledOnce();
 });
});
