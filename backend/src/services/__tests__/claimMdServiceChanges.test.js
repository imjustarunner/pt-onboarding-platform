import { beforeEach,describe,it,expect,vi } from 'vitest';
const m=vi.hoisted(()=>({policy:vi.fn(),document:vi.fn(),event:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../supervisedBillingPolicy.service.js',async orig=>({...await orig(),resolveDocumentationPolicy:m.policy}));
vi.mock('../clinicalReviewDocument.service.js',()=>({loadReviewDocument:m.document}));
vi.mock('../familyBillingEncryption.service.js',()=>({encryptFamilyBilling:JSON.stringify,decryptFamilyBilling:JSON.parse}));
vi.mock('../claimMdWorkflow.service.js',()=>({recordClaimEvent:m.event}));
import { normalizeClinicalServiceLines,previouslyTransmitted,resolveServiceChange,assertOriginalTransmissionAllowed } from '../claimServiceChanges.service.js';
import { appendClinicalNoteAmendment } from '../clinicalNoteAmendment.service.js';
import ClinicalClaim from '../../models/clinical/ClinicalClaim.model.js';
const note={id:4,agency_id:1,clinical_session_id:2,client_id:3,created_by_user_id:5,provider_signed_at:'2026-09-20',addendum_count:1,supervisor_cosigned_at:'2026-09-22',supervisor_cosigned_by_user_id:9,metadata_json:{supervisorCosign:{contentHash:'current'}}};
const change={id:8,agency_id:1,clinical_session_id:2,clinical_note_id:4,addendum_id:6,status:'pending',proposed_lines_encrypted:JSON.stringify([{procedureCode:'90834',units:1}])};
function setup(claim={}) {
  const c={id:7,agency_id:1,clinical_session_id:2,clinical_note_id:4,billing_revision:2,claim_lifecycle:'draft',date_of_service:'2026-09-20',...claim};
  const db={execute:vi.fn(async sql=>{
    if(sql.startsWith('SELECT * FROM clinical_claims'))return [[c]];
    if(sql.startsWith('SELECT clinical_note_id'))return [[{clinical_note_id:4}]];
    if(sql.startsWith('SELECT * FROM clinical_notes'))return [[note]];
    if(sql.startsWith('SELECT * FROM clinical_claim_change_requests'))return [[change]];
    if(sql.startsWith('SELECT'))return [[]];
    return [{affectedRows:1,insertId:6}];
  }),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
  return {db,source:{getConnection:async()=>db}};
}
const args={agencyId:1,claimId:7,requestId:8,actorUserId:10,action:'apply_draft',reason:'Corrected service duration and procedure',charges:[12000],lineDetails:[{modifiers:[],diagnosisPointers:"1"}],revision:2};
beforeEach(()=>{vi.clearAllMocks();m.policy.mockResolvedValue({supervisorUserId:9});m.document.mockResolvedValue({row:note,hash:'current'});});
describe('amendments never create duplicate original claims',()=>{
  it('validates clinical proposals without accepting charges from clinicians',()=>{
    expect(normalizeClinicalServiceLines([{procedureCode:'h0023',units:1,chargeCents:999}])).toEqual([{procedureCode:'H0023',units:1}]);
    expect(()=>normalizeClinicalServiceLines([{procedureCode:'90834',units:0}])).toThrow();
  });
  it.each(['submitted','queued','paid','denied','adjusted','void','rejected'])('preserves the %s original and refuses draft application',async lifecycle=>{
    const {db,source}=setup({claim_lifecycle:lifecycle});await expect(resolveServiceChange(args,source)).rejects.toMatchObject({status:409});expect(db.rollback).toHaveBeenCalled();expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('DELETE'))).toBe(false);
  });
  it('detects legacy paid status even when lifecycle is draft',()=>expect(previouslyTransmitted({claim_lifecycle:'draft',claim_status:'PAID'})).toBe(true));
  it('updates existing draft lines only, records before/after, and requires new review',async()=>{
    const {db,source}=setup();expect(await resolveServiceChange(args,source)).toMatchObject({status:'applied'});
    expect(db.execute.mock.calls.some(([sql])=>/^INSERT INTO clinical_claims\b/.test(sql))).toBe(false);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("claim_lifecycle='draft'"),[4,12000,expect.stringContaining('90834'),7,1]);
    expect(m.event).toHaveBeenCalledWith(expect.objectContaining({eventType:'service_change_applied',payload:expect.objectContaining({sourceHash:'current'})}),db);expect(db.commit).toHaveBeenCalled();
  });
  it('holds correction until fresh supervisor signoff, even if billing wants no claim change',async()=>{
    m.document.mockResolvedValue({row:{...note,supervisor_cosigned_at:null},hash:'current'});const {db,source}=setup();await expect(resolveServiceChange({...args,action:'no_claim_change'},source)).rejects.toMatchObject({status:409});expect(db.commit).not.toHaveBeenCalled();
  });
  it('keeps paid claims on a separate reconciliation hold without modifying paid status, lines or amount',async()=>{
    const {db,source}=setup({claim_lifecycle:'paid',claimmd_claim_id:'123'});
    expect(await resolveServiceChange({...args,action:'payer_followup',reference:'Payer ICN 123, correction case ABC'},source)).toMatchObject({status:'reconciliation_required'});
    const updates=db.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE clinical_claims'));expect(updates).toHaveLength(1);expect(updates[0][0]).not.toMatch(/amount_cents|claim_lifecycle/);expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('DELETE'))).toBe(false);
  });
  it('supports an audited decision that an approved amendment needs no claim change',async()=>{
    const {db,source}=setup({claim_lifecycle:'paid'});expect(await resolveServiceChange({...args,action:'no_claim_change',reference:'ICN 123 reviewed with ERA 456'},source)).toMatchObject({status:'no_claim_change'});expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('DELETE')||sql.startsWith('INSERT INTO clinical_claim_lines'))).toBe(false);
  });
  it('closes externally reconciled follow-up without posting another payment or permitting original retransmission',async()=>{
    const {db,source}=setup({claim_lifecycle:'paid'});const original=db.execute.getMockImplementation();db.execute.mockImplementation(async(sql,...rest)=>sql.startsWith('SELECT * FROM clinical_claim_change_requests')?[[{...change,status:'reconciliation_required'}]]:original(sql,...rest));
    expect(await resolveServiceChange({...args,action:'external_reconciled',reference:'ICN 123, corrected ERA 456, recoupment verified'},source)).toMatchObject({status:'reconciled'});
    expect(db.execute.mock.calls.some(([sql])=>/INSERT INTO .*payment|amount_cents=|claim_lifecycle=/.test(sql))).toBe(false);
  });
  it('blocks a stale billing decision without changing lines',async()=>{
    const {db,source}=setup();await expect(resolveServiceChange({...args,revision:1},source)).rejects.toMatchObject({status:409});expect(db.commit).not.toHaveBeenCalled();
  });
  it('refuses original transmission when durable history shows an earlier attempt',async()=>{
    const db={execute:vi.fn().mockResolvedValue([[{id:1}]])};await expect(assertOriginalTransmissionAllowed({id:7,agency_id:1,claim_lifecycle:'draft'},db)).rejects.toMatchObject({status:409});
  });
  it('plain narrative addenda touch the note/signature only, never claims or service-change requests',async()=>{
    const {db,source}=setup();await appendClinicalNoteAmendment({noteId:4,agencyId:1,body:'Additional context only',actorUserId:5,entryKind:'addendum',reason:'New information',authorAttested:true},source);
    expect(db.execute.mock.calls.some(([sql])=>sql.includes('clinical_claim'))).toBe(false);expect(db.commit).toHaveBeenCalled();
  });
  it('atomically records attested code corrections with the addendum, no new claim',async()=>{
    const {db,source}=setup();const base=db.execute.getMockImplementation();db.execute.mockImplementation(async(sql,...rest)=>sql.startsWith('SELECT clinical_session_id')?[[{clinical_session_id:2}]]:base(sql,...rest));
    await appendClinicalNoteAmendment({noteId:4,agencyId:1,body:'Correct duration',actorUserId:5,entryKind:'correction',reason:'Duration documented incorrectly',authorAttested:true,serviceLines:[{procedureCode:'90834',units:1}]},source);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO clinical_note_addenda'),expect.arrayContaining([expect.stringContaining('90834: 1 unit(s)')]));
    expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO clinical_claim_change_requests'))).toBe(true);expect(db.execute.mock.calls.some(([sql])=>/^INSERT INTO clinical_claims\b/.test(sql))).toBe(false);expect(db.commit).toHaveBeenCalled();
  });
  it('central claim creation blocks an existing original regardless of deleted/void status or note version',async()=>{
    const db={execute:vi.fn().mockResolvedValueOnce([[{id:2}]]).mockResolvedValueOnce([[{id:7}]])};await expect(ClinicalClaim.create({clinicalSessionId:2,agencyId:1,clientId:3,db})).rejects.toMatchObject({status:409});expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);expect(db.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  });
});
