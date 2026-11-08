import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { isNoView: p => p.noView === true, listForClient: vi.fn() } }));
import { summarizeGuardianRoiDecisions, restrictSchoolRoiState, recordGuardianRoiConsent, loadGuardianRoiConsent, canReceiveGuardianConsentRequest } from '../schoolRoiGuardianConsent.service.js';
const signed = (guardian, decision, overrides = {}) => ({ client_id: 10, guardian_user_id: guardian, school_staff_user_id: 90, intake_submission_id: guardian, decision, signed_at: '2026-11-07T17:00:00Z', expires_at: '2029-11-07T17:00:00Z', first_name: `Parent ${guardian}`, ...overrides });
const now = new Date('2026-11-08T00:00:00Z');
it.each([['none','roi_docs'],['roi_docs','none']])('denial prevails regardless of signing order: %s then %s', (first,second) => {
  const [result] = summarizeGuardianRoiDecisions([signed(1,first),signed(2,second)], { now });
  expect(result).toMatchObject({ effectiveDecision: 'none', conflict: true }); expect(result.decisions).toHaveLength(2);
  expect(restrictSchoolRoiState('roi_docs',result)).toBe('denied');
});
it('keeps speaking permission while blocking documents when either guardian restricts documents', () => {
  const [result] = summarizeGuardianRoiDecisions([signed(1,'roi_docs'),signed(2,'roi')],{now});
  expect(result.effectiveDecision).toBe('roi'); expect(restrictSchoolRoiState('roi_docs',result)).toBe('roi');
});
it('lets only the same guardian replace their decision, preserving the other guardian denial', () => {
  const rows=[signed(1,'none'),signed(2,'none'),signed(1,'roi_docs',{signed_at:'2026-11-07T18:00:00Z',intake_submission_id:3})];
  expect(summarizeGuardianRoiDecisions(rows,{now})[0].effectiveDecision).toBe('none');
  rows.push(signed(2,'roi_docs',{signed_at:'2026-11-07T19:00:00Z',intake_submission_id:4}));
  expect(summarizeGuardianRoiDecisions(rows.reverse(),{now})[0].effectiveDecision).toBe('roi_docs');
});
it('uses a current signed permission while the other guardian renewal is pending',()=>{
  const [result]=summarizeGuardianRoiDecisions([signed(1,'roi_docs',{expires_at:'2026-11-01T00:00:00Z'}),signed(2,'roi_docs')],{now});
  expect(result.effectiveDecision).toBe('roi_docs'); expect(result.decisions[0].expired).toBe(true);
});
it.each([{access_enabled:0},{permissions_json:{noContact:true}},{permissions_json:{canSignDocs:false}},{permissions_json:{noView:true}},{is_active:0},{status:'ARCHIVED'}])('does not invite a restricted or inactive guardian: %j', patch=>{
 expect(canReceiveGuardianConsentRequest({guardian_user_id:1,access_enabled:1,is_active:1,...patch})).toBe(false);
});
it('reads historical signed denials without rewriting the original signed record',async()=>{
 const execute=vi.fn().mockResolvedValueOnce([[signed(1,'roi_docs')]]).mockResolvedValueOnce([[{...signed(2,'none'),decisions_json:JSON.stringify([{schoolStaffUserId:90,decision:'none'}])}]]);
 const result=await loadGuardianRoiConsent({clientId:10,schoolOrganizationId:20,db:{execute}});
 expect(result[0].effectiveDecision).toBe('none');expect(execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
 expect(execute.mock.calls[1][1]).toEqual([10,20]);
});
it('locks the child and commits the combined permissions with the signed evidence',async()=>{
 const operations=[];const db={getConnection:async()=>connection};
 const connection={beginTransaction:vi.fn(async()=>operations.push('begin')),commit:vi.fn(async()=>operations.push('commit')),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql)=>{
  if(sql.includes('FOR UPDATE'))operations.push('lock');
  if(sql.startsWith('INSERT'))operations.push('insert');
  if(sql.includes('FROM client_school_roi_guardian_decisions')){operations.push('read');return [[signed(1,'none'),signed(2,'roi_docs')]];}
  return [[]];
 })};
 const applyState=vi.fn(async args=>{operations.push('apply');expect(args).toMatchObject({schoolStaffUserId:90,nextState:'packet',db:connection});});
 await recordGuardianRoiConsent({clientId:10,schoolOrganizationId:20,guardianUserId:2,submissionId:2,signedAt:'2026-11-07T17:00:00Z',response:{staffDecisions:[{schoolStaffUserId:90,decision:'roi_docs'}]},db,applyState,loadGuardians:async()=>[{guardian_user_id:2,access_enabled:1}]});
 expect(operations).toEqual(['begin','lock','insert','read','apply','commit']);expect(connection.release).toHaveBeenCalled();
});
it('refuses an unknown signer before changing access',async()=>{
 const db={getConnection:vi.fn()};await expect(recordGuardianRoiConsent({clientId:10,schoolOrganizationId:20,response:{},submissionId:1,db})).rejects.toMatchObject({status:409});expect(db.getConnection).not.toHaveBeenCalled();
});

it('uses the first signed permission when the other guardian has not responded', () => {
 expect(summarizeGuardianRoiDecisions([signed(1,'roi_docs')],{now})[0].effectiveDecision).toBe('roi_docs');
});
it('never treats an expired denial as permission', () => {
 expect(summarizeGuardianRoiDecisions([signed(1,'none',{expires_at:'2026-01-01'}),signed(2,'roi_docs')],{now})[0].effectiveDecision).toBe('none');
 expect(summarizeGuardianRoiDecisions([signed(1,'roi_docs',{expires_at:'2026-01-01'})],{now})[0].effectiveDecision).toBe('none');
});
