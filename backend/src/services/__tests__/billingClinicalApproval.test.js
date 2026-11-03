import { describe, it, expect, vi } from 'vitest';
import { clinicalBillingStage, clinicalBillingStageFromSummary, loadClinicalBillingApproval, assertClinicalBillingApproval } from '../billingClinicalApproval.service.js';
import { billingWorkStage } from '../billingWorkItems.service.js';

const original = { clinical_note_id: 71, provider_signed_at: '2026-11-03', effective_revision_id: 171, requires_supervisor_cosign: 0, is_billable: 1 };
describe('persisted clinical approval shared by queue and recovery', () => {
  it.each([
    ['legacy-observed H0002 with no exact author signature', original, 'pending_review'],
    ['an exact independent author signature', {...original,has_original_signature:1}, 'ready_to_submit'],
    ['an exact author signature still requiring a supervisor', {...original,has_original_signature:1,requires_supervisor_cosign:1}, 'pending_review'],
    ['an approved amended version', {...original,approved_at:'2026-11-03'}, 'ready_to_submit'],
    ['a supervisor cosigned original', {...original,supervisor_cosigned_at:'2026-11-03'}, 'ready_to_submit'],
    ['a pending supervisor amendment', {...original,approved_at:'2026-11-03',pending_revision_id:172,pending_revision_origin:'supervisor'}, 'pending_review'],
    ['an unsigned provider amendment', {...original,approved_at:'2026-11-03',pending_revision_id:172,pending_revision_origin:'provider'}, 'draft'],
    ['unresolved requested changes', {...original,approved_at:'2026-11-03',review_requests_json:[{action:'changes_needed'}]}, 'revisions_needed']
  ])('%s has identical queue and recovery eligibility', async (_name,row,stage) => {
    const db={execute:vi.fn(async()=>[[row]])};
    expect(clinicalBillingStage(row)).toBe(stage);
    expect(billingWorkStage(row)).toBe(stage);
    expect(await loadClinicalBillingApproval({noteId:71,agencyId:2},db)).toMatchObject({stage,approved:stage==='ready_to_submit'});
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('n.id=? AND n.agency_id=? AND n.is_deleted=0'),[71,2]);
    if(stage!=='ready_to_submit') await expect(assertClinicalBillingApproval({noteId:71,agencyId:2},db)).rejects.toMatchObject({status:409,code:'CLINICAL_APPROVAL_REQUIRED',clinicalStage:stage});
  });
  it('does not create signatures, revisions or claims while evaluating recovery',async()=>{
    const db={execute:vi.fn(async()=>[[original]])};
    expect((await loadClinicalBillingApproval({noteId:71,agencyId:2},db)).approved).toBe(false);
    for(const [sql] of db.execute.mock.calls)expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });
  it('rejects a missing or foreign note',async()=>{
    await expect(assertClinicalBillingApproval({noteId:71,agencyId:9},{execute:async()=>[[]]})).rejects.toMatchObject({code:'CLINICAL_APPROVAL_REQUIRED'});
  });
  it('does not infer a signature from legacy provenance or current supervisor absence in readiness',()=>{
    const note={id:71,provider_signed_at:'2026-11-03',is_billable:1};
    const summary={effectiveRevisionId:171,effectiveRevision:{requiresSupervisorCosign:false,signatures:[],provenance:{kind:'legacy_observed'}}};
    expect(clinicalBillingStageFromSummary(note,summary)).toBe('pending_review');
    summary.effectiveRevision.signatures=[{action:'initial_author_sign'}];
    expect(clinicalBillingStageFromSummary(note,summary)).toBe('ready_to_submit');
    summary.pendingRevisionId=172;summary.pendingRevision={origin:'supervisor'};
    expect(clinicalBillingStageFromSummary(note,summary)).toBe('pending_review');
  });
});
