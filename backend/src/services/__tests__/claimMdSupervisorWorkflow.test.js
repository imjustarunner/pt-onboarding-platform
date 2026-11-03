import { beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:v=>`encrypted:${v}`,maybeDecryptNotePayload:v=>String(v || '').replace(/^encrypted:/,'')}));
const mocks=vi.hoisted(()=>({review:vi.fn()}));
vi.mock('../clinicalReviewDocument.service.js',()=>({loadReviewDocument:mocks.review}));
import pool from '../../config/database.js';
import { appendReviewRequest, acknowledgeReviewRequest, reviewRequestsForDisplay, normalizeServiceDetails, effectiveServiceDetails, pendingServiceDetails, assertNoUnresolvedChanges, assertServiceDetailsComplete, serviceDetailTimes, lockedNoteMutation, applyApprovedServiceDetails, reviewSnapshotToken, serviceDetailBillingBlockers, synchronizeSupervisorQueue, markSupervisorQueue, verifiedServiceLocation, serviceLocationSnapshot } from '../clinicalSupervisorReview.service.js';
const details={durationMinutes:60,locationLabel:'Demo office',startTime:'10:00',endTime:'11:00',placeOfService:'11',serviceLocationId:11};
describe('supervisor review workflow and service detail audit',()=>{
  beforeEach(()=>{vi.clearAllMocks();pool.execute.mockResolvedValue([[{id:11,name:'Demo office',place_of_service:'11',billing_office_location_id:21}]]);});
  it('keeps feedback separate from required changes and requires author acknowledgement',()=>{
    const meta={};
    const feedback=appendReviewRequest(meta,{action:'feedback',message:'Clear assessment.',actorUserId:9,contentHash:'v1'});
    const change=appendReviewRequest(meta,{action:'changes_needed',message:'Clarify the intervention.',actorUserId:9,contentHash:'v1'});
    expect(meta.reviewRequests[0]).not.toHaveProperty('message');
    expect(reviewRequestsForDisplay(meta)[0].message).toBe('Clear assessment.');
    expect(()=>acknowledgeReviewRequest(meta,feedback.id,9,5)).toThrow(/Only the note author/);
    expect(()=>acknowledgeReviewRequest(meta,change.id,5,5)).toThrow(/Sign an amendment/);
    acknowledgeReviewRequest(meta,feedback.id,5,5,'2026-11-02T16:00:00Z');
    expect(feedback.dismissedByUserId).toBe(5);expect(feedback.acknowledgedAt).toBeNull();
    const request=appendReviewRequest(meta,{action:'review_acknowledge',message:'Please review',actorUserId:9});
    acknowledgeReviewRequest(meta,request.id,5,5);expect(request.acknowledgedByUserId).toBe(5);expect(request.dismissedAt).toBeUndefined();
    expect(()=>assertNoUnresolvedChanges(meta)).toThrow(/requested changes/);
    change.resolvedAt='2026-11-02T17:00:00Z'; expect(()=>assertNoUnresolvedChanges(meta)).not.toThrow();
  });
  it.each([{durationMinutes:30},{locationLabel:''},{placeOfService:'school'},{startTime:'10:90'},{endTime:'09:00'},{durationMinutes:0}])('rejects inconsistent service details %j',patch=>expect(()=>normalizeServiceDetails({...details,...patch})).toThrow());
  it('preserves original fields until approval and then selects the newest approved correction',()=>{
    const note={metadata_json:{structuredChart:{durationMinutes:45,locationLabel:'Old'},serviceDetailAmendments:[{id:1,serviceDetails:details,approvedAt:null}]}};
    expect(effectiveServiceDetails(note).durationMinutes).toBe(45);expect(pendingServiceDetails(note.metadata_json)).toEqual(details);
    note.metadata_json.serviceDetailAmendments[0].approvedAt='2026-11-02';
    expect(effectiveServiceDetails(note)).toEqual(details);
    note.metadata_json.serviceDetailAmendments.push({id:2,serviceDetails:{...details,locationLabel:'Newer'},approvedAt:'2026-11-03'});
    expect(effectiveServiceDetails(note).locationLabel).toBe('Newer');
  });
  it('converts Denver wall time explicitly and rejects nonexistent DST times',()=>{
    expect(serviceDetailTimes(details,'2026-11-02','America/Denver')).toEqual({startAt:'2026-11-02 17:00:00',endAt:'2026-11-02 18:00:00'});
    expect(()=>serviceDetailTimes({...details,startTime:'02:30',endTime:'03:30'},'2026-03-08','America/Denver')).toThrow(/does not exist/);
  });
  it('blocks approval when the service essentials are missing',()=>{
    expect(()=>assertServiceDetailsComplete({metadata_json:{}},{})).toThrow(/durationMinutes.*locationLabel.*startTime.*endTime/);
    expect(()=>assertServiceDetailsComplete({metadata_json:{structuredChart:details}},{})).not.toThrow();
  });
  const setup=()=>{
    const note={id:4,agency_id:2,client_id:3,created_by_user_id:5,provider_signed_at:'2026-10-22',metadata_json:{},clinical_session_id:7};
    const db={execute:vi.fn(async sql=>sql.includes('SELECT * FROM clinical_notes')?[[note]]:[[]]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
    mocks.review.mockResolvedValue({row:note,hash:'current'});return{note,db,source:{getConnection:async()=>db}};
  };
  it('rejects stale content under the note lock without writing metadata',async()=>{
    const {db,source}=setup(),mutate=vi.fn();
    await expect(lockedNoteMutation({noteId:4,agencyId:2,contentHash:'stale',mutate},source)).rejects.toMatchObject({status:409});
    expect(db.execute.mock.calls[0][0]).toContain('FOR UPDATE');expect(mutate).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalled();
  });
  it('stores current feedback without rewriting the signed payload',async()=>{
    const {db,source,note}=setup();
    await lockedNoteMutation({noteId:4,agencyId:2,contentHash:'current',snapshotToken:reviewSnapshotToken(note),mutate:({meta})=>appendReviewRequest(meta,{action:'review_acknowledge',message:'Please review the claim amendment.',actorUserId:9})},source);
    const [sql,values]=db.execute.mock.calls.at(-1);expect(sql).not.toContain('note_payload');expect(JSON.parse(values[0]).reviewRequests[0].action).toBe('review_acknowledge');expect(db.commit).toHaveBeenCalled();
  });
  it('applies the latest approved details to the encounter and existing draft while invalidating draft approval',async()=>{
    const note={id:4,agency_id:2,clinical_session_id:7}, meta={serviceDetailAmendments:[{id:11,serviceDetails:details,dateOfService:'2026-11-02',timeZone:'America/Denver',approvedAt:null}]};
    const db={execute:vi.fn(async sql=>sql.includes('SELECT * FROM clinical_sessions')?[[{id:7}]]:sql.includes('SELECT * FROM clinical_claims')?[[{id:8,claim_lifecycle:'draft',claim_payload:'{}'}]]:[[]])};
    await applyApprovedServiceDetails(db,note,meta,9,'2026-11-02T20:00:00Z');
    const [sql,values]=db.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE clinical_claims'));
    expect(sql).toContain('billing_revision=billing_revision+1');expect(sql).toContain("claim_lifecycle='draft'");expect(values[0]).toBe('11');expect(JSON.parse(values[1]).serviceDetails).toEqual(details);expect(meta.serviceDetailAmendments[0].approvedByUserId).toBe(9);
    expect(db.execute.mock.calls.some(([sql])=>sql.includes('note_payload='))).toBe(false);
  });
  it('refuses a previously transmitted claim even if its lifecycle was reset to draft',async()=>{
    const meta={serviceDetailAmendments:[{id:11,serviceDetails:details,dateOfService:'2026-11-02',timeZone:'America/Denver'}]};
    const db={execute:vi.fn(async sql=>sql.includes('SELECT * FROM clinical_sessions')?[[{id:7}]]:sql.includes('SELECT * FROM clinical_claims')?[[{id:8,claim_lifecycle:'draft',claimmd_claim_id:'previous'}]]:[[]])};
    await expect(applyApprovedServiceDetails(db,{agency_id:2,clinical_session_id:7},meta,9,'now')).rejects.toMatchObject({status:409});
    expect(meta.serviceDetailAmendments[0].approvedAt).toBeUndefined();
  });
  it('binds review metadata and signature snapshots independently of the narrative hash',async()=>{
    const {db,source,note}=setup(), token=reviewSnapshotToken(note);
    note.metadata_json={reviewRequests:[{action:'review_acknowledge',id:'later'}]};
    expect(reviewSnapshotToken(note)).not.toBe(token);
    const mutate=vi.fn();
    await expect(lockedNoteMutation({noteId:4,agencyId:2,contentHash:'current',snapshotToken:token,mutate},source)).rejects.toMatchObject({status:409});
    expect(mutate).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalled();
  });
  it('keeps offset-bearing session timestamps intact and fails closed for unknown timezones',()=>{
    const session={scheduled_start_at:'2026-11-02T10:00:00-07:00',scheduled_end_at:'2026-11-02T11:00:00-07:00',source_timezone:'America/Denver'};
    expect(effectiveServiceDetails({},session)).toMatchObject({startTime:'10:00',endTime:'11:00'});
    expect(effectiveServiceDetails({},{...session,source_timezone:'not/a-zone'}).startTime).toBeNull();
  });
  it('blocks stale claim POS and service units after an approved duration amendment',async()=>{
    const note={agency_id:2,metadata_json:{serviceCode:'H2014',serviceDetailAmendments:[{approvedAt:'now',serviceDetails:details}]}};
    const codes=async()=>[{service_code:'H2014',unit_calc_mode:'MEDICAID_8_MINUTE_LADDER',unit_minutes:15,min_minutes:8,max_units_per_session:12}];
    const wrong=await serviceDetailBillingBlockers(note,{place_of_service:'03'},[{procedure_code:'H2014',units:1}],codes);
    expect(wrong.join(' ')).toMatch(/place of service/);expect(wrong.join(' ')).toMatch(/code\/units/);
    expect(await serviceDetailBillingBlockers(note,{place_of_service:'11'},[{procedure_code:'H2014',units:4}],codes)).toEqual([]);
    expect((await serviceDetailBillingBlockers(note,{place_of_service:'11'},[{procedure_code:'H2014',units:4}],async()=>[])).join(' ')).toMatch(/duration rule/);
  });

  it('rejects omitted snapshot tokens and session drift even when narrative hash is unchanged',async()=>{
    const {source,note,db}=setup(), mutate=vi.fn();
    await expect(lockedNoteMutation({noteId:4,agencyId:2,contentHash:'current',mutate},source)).rejects.toMatchObject({status:409});
    const token=reviewSnapshotToken(note);
    db.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM clinical_notes')?[[note]]:sql.includes('SELECT * FROM clinical_sessions')?[[{duration_minutes:45}]]:[[]]);
    await expect(lockedNoteMutation({noteId:4,agencyId:2,contentHash:'current',snapshotToken:token,mutate},source)).rejects.toMatchObject({status:409});
    expect(mutate).not.toHaveBeenCalled();
  });
  it('rejects inconsistent timing already present in original signed notes',()=>{
    expect(()=>assertServiceDetailsComplete({metadata_json:{structuredChart:{...details,endTime:'10:20'}}},{})).toThrow(/duration must agree/);
    expect(()=>assertServiceDetailsComplete({metadata_json:{structuredChart:{...details,durationMinutes:'abc'}}},{})).toThrow(/duration must agree/);
  });
  it('rejects duplicate primary claim lines rather than trusting the first matching units',async()=>{
    const note={agency_id:2,metadata_json:{serviceCode:'H2014',serviceDetailAmendments:[{approvedAt:'now',serviceDetails:details}]}};
    const codes=async()=>[{service_code:'H2014',unit_calc_mode:'MEDICAID_8_MINUTE_LADDER',unit_minutes:15,min_minutes:8,max_units_per_session:12}];
    const result=await serviceDetailBillingBlockers(note,{place_of_service:'11'},[{procedure_code:'H2014',units:4},{procedure_code:'H2014',units:4}],codes);
    expect(result.join(' ')).toMatch(/code\/units/);
  });
  it('keeps a durable pending marker when queue synchronization fails and retries idempotently',async()=>{
    const note={id:4,agency_id:2,created_by_user_id:5,provider_signed_at:'2026-11-02'},meta={};
    const marker=markSupervisorQueue(meta,note,9,'signed');
    const db={execute:vi.fn().mockResolvedValue([[{metadata_json:meta}]]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn().mockResolvedValue(),release:vi.fn()};
    const deps={main:{execute:vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue([{}])},clinical:{getConnection:async()=>db}};
    expect(await synchronizeSupervisorQueue(note,marker,deps)).toBe(false);expect(marker.synchronizedAt).toBeNull();expect(db.rollback).toHaveBeenCalled();
    expect(await synchronizeSupervisorQueue(note,marker,deps)).toBe(true);expect(db.commit).toHaveBeenCalled();
    expect(deps.main.execute.mock.calls[1][0]).toContain('ON DUPLICATE KEY UPDATE');
  });
  it('does not let delayed queue synchronization overwrite a newer amendment marker',async()=>{
    const note={id:4,agency_id:2,created_by_user_id:5},meta={};const stale=markSupervisorQueue(meta,note,9,'signed');markSupervisorQueue(meta,note,9,'awaiting_supervisor');
    const db={execute:vi.fn().mockResolvedValue([[{metadata_json:meta}]]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn().mockResolvedValue(),release:vi.fn()};
    const main={execute:vi.fn()};expect(await synchronizeSupervisorQueue(note,stale,{main,clinical:{getConnection:async()=>db}})).toBe(false);expect(main.execute).not.toHaveBeenCalled();
  });
  it('requires a same-agency active location and rejects address drift after attestation',async()=>{
    const source={execute:vi.fn().mockResolvedValue([[]])};
    await expect(verifiedServiceLocation(2,details,source)).rejects.toMatchObject({status:409});expect(source.execute.mock.calls[0][1]).toEqual([11,2]);
    const old={id:11,name:'Demo office',place_of_service:'11',street_address:'100 DEMO Way'};
    source.execute.mockResolvedValue([[{...old,street_address:'200 DEMO Way'}]]);
    await expect(verifiedServiceLocation(2,{...details,locationSnapshot:serviceLocationSnapshot(old)},source)).rejects.toMatchObject({status:409});
  });

});
