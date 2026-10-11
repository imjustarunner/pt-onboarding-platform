import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: vi.fn() }));
vi.mock('../staffCareEligibility.service.js', () => ({ requireStaffCareEligibility: vi.fn() }));
vi.mock('../../utils/supervisorSchoolAccess.js', () => ({ supervisorCanAccessClientInOrg: vi.fn() }));
import pool from '../../config/clinicalDatabase.js';
import { resolveClientRecordAccess } from '../clientRecordAccess.service.js';
import { requireStaffCareEligibility } from '../staffCareEligibility.service.js';
import { supervisorCanAccessClientInOrg } from '../../utils/supervisorSchoolAccess.js';
import { outcomeCatalogFor, assertOutcomeClientAccess, saveOutcomeResponse, listOutcomeResponses, reviewOutcomeResponse } from '../outcomeMeasures.service.js';
vi.mock('../nluLearningAccess.service.js', async original => ({ ...(await original()), isNluAgency: vi.fn(), assertPilotCatalogAgency: vi.fn() }));
import { isNluAgency } from '../nluLearningAccess.service.js';
import { getOutcomeMeasure } from '../../data/outcomeMeasures.js';
const user={id:7,role:'provider'}, client={id:41,agency_id:12,organization_id:13};
const input=()=>({measureId:'phq-9',version:getOutcomeMeasure('phq-9').version,requestId:'11111111-1111-4111-8111-111111111111',clinicalFitConfirmed:true,administration:'self',answers:Object.fromEntries(Array.from({length:9},(_,i)=>[`q${i+1}`,'0']))});
let rows,reviewRace;
beforeEach(()=>{
  vi.resetAllMocks(); isNluAgency.mockResolvedValue(false); rows=[];reviewRace=false;
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,9).toString('base64'));
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEYS_JSON','');
  resolveClientRecordAccess.mockResolvedValue({ok:true,isAssignedClinician:true,client}); requireStaffCareEligibility.mockResolvedValue(true); supervisorCanAccessClientInOrg.mockResolvedValue(false);
  pool.execute.mockImplementation(async(sql,v)=>{
    if(sql.startsWith('INSERT')) { const id=rows.length+1; rows.push({id,client_id:v[0],agency_id:v[1],measure_id:v[2],measure_version:v[3],request_id:v[4],recorded_by_user_id:v[5],payload_encrypted:v[6],recorded_at:'2026-10-10T10:00:00Z'});return [{insertId:id}]; }
    if(sql.startsWith('UPDATE')) { const row=rows.find(r=>r.id===v[2]&&r.client_id===v[3]&&r.agency_id===v[4]&&!r.reviewed_at); if(!row||reviewRace)return[{affectedRows:0}];Object.assign(row,{reviewed_by_user_id:v[0],review_encrypted:v[1],reviewed_at:'2026-10-10T10:05:00Z'});return[{affectedRows:1}]; }
    if(sql.includes('request_id =')) return [rows.filter(r=>r.client_id===v[0]&&r.agency_id===v[1]&&r.recorded_by_user_id===v[2]&&r.request_id===v[3])];
    if(sql.includes('WHERE id =')) return [rows.filter(r=>r.id===v[0]&&r.client_id===v[1]&&r.agency_id===v[2])];
    if(sql.includes('ORDER BY'))return [rows.filter(r=>r.client_id===v[0]&&r.agency_id===v[1]).toReversed()];
    throw new Error('Unhandled test query');
  });
});
afterEach(()=>vi.unstubAllEnvs());
describe('clinical authorization',()=>{
  it.each(['school_staff','client','guardian','support','staff','approved_employee'])('does not grant %s clinical access through the catalog',async role=>{
    await expect(listOutcomeResponses({...user,role},41)).rejects.toMatchObject({status:403});expect(pool.execute).not.toHaveBeenCalled();expect(resolveClientRecordAccess).not.toHaveBeenCalled();
  });
  it('rejects other clients and malformed IDs before fetching assessments',async()=>{
    await expect(assertOutcomeClientAccess(user,'41 OR 1=1')).rejects.toMatchObject({status:400});
    resolveClientRecordAccess.mockResolvedValue({ok:false,status:403});await expect(listOutcomeResponses(user,99)).rejects.toMatchObject({status:403});expect(pool.execute).not.toHaveBeenCalled();
  });
  it('does not let an unassigned intern use agency membership alone',async()=>{
    resolveClientRecordAccess.mockResolvedValue({ok:true,isAssignedClinician:false,client});await expect(listOutcomeResponses({...user,role:'intern'},41)).rejects.toMatchObject({status:403});
    supervisorCanAccessClientInOrg.mockResolvedValue(true);await expect(listOutcomeResponses({...user,role:'supervisor'},41)).resolves.toEqual([]);
  });
  it('requires active care eligibility for recording and review',async()=>{
    requireStaffCareEligibility.mockRejectedValue(Object.assign(new Error('Care eligibility required'),{status:403}));
    await expect(saveOutcomeResponse(user,41,input())).rejects.toMatchObject({status:403});expect(pool.execute).not.toHaveBeenCalled();
  });
});
describe('encrypted, versioned clinical records',()=>{
  it('encrypts questionnaire and responses and ignores client-supplied scores or agency',async()=>{
    const saved=await saveOutcomeResponse(user,41,{...input(),agencyId:99,result:{total:900}});
    expect(saved.result.total).toBe(0);expect(saved.questionnaire.items).toHaveLength(10);expect(rows[0].agency_id).toBe(12);
    expect(JSON.parse(rows[0].payload_encrypted)._enc).toBe(true);expect(rows[0].payload_encrypted).not.toContain('questionnaire');
    expect((await listOutcomeResponses(user,41))[0].answers.q1).toBe('0');
  });
  it('refuses unreviewed instruments, stale versions, empty responses and missing fit confirmation',async()=>{
    for(const patch of [{measureId:'eat-26'},{version:'old'},{answers:{}},{clinicalFitConfirmed:false},{requestId:'bad'},{administration:'proxy'}]) await expect(saveOutcomeResponse(user,41,{...input(),...patch})).rejects.toBeTruthy();
    expect(rows).toHaveLength(0);
  });
  it('makes retries idempotent while rejecting changed responses and administration methods',async()=>{
    const a=input();expect((await saveOutcomeResponse(user,41,a)).id).toBe((await saveOutcomeResponse(user,41,a)).id);expect(rows).toHaveLength(1);
    await expect(saveOutcomeResponse(user,41,{...a,answers:{q1:'1'}})).rejects.toMatchObject({status:409});
    await expect(saveOutcomeResponse(user,41,{...a,administration:'clinician_assisted'})).rejects.toMatchObject({status:409});
  });
  it('fails closed without an encryption key and does not store plaintext',async()=>{
    vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64','');await expect(saveOutcomeResponse(user,41,input())).rejects.toThrow('not configured');expect(rows).toHaveLength(0);
  });
  it('scopes history and replay lookup to the client’s authorized agency',async()=>{
    await saveOutcomeResponse(user,41,input());resolveClientRecordAccess.mockResolvedValue({ok:true,isAssignedClinician:true,client:{id:41,agency_id:99}});
    expect(await listOutcomeResponses(user,41)).toEqual([]);const saved=await saveOutcomeResponse(user,41,input());expect(saved.id).toBe(2);expect(rows[1].agency_id).toBe(99);
    await expect(reviewOutcomeResponse(user,41,1,{note:'Wrong agency'})).rejects.toMatchObject({status:404});
  });
  it('keeps answers immutable and requires explicit follow-up for the safety flag',async()=>{
    const a=input();a.answers.q9='1';const saved=await saveOutcomeResponse(user,41,a);const original=rows[0].payload_encrypted;
    await expect(reviewOutcomeResponse(user,41,saved.id,{note:'Synthetic clinical review'})).rejects.toMatchObject({status:400});
    await reviewOutcomeResponse(user,41,saved.id,{note:'Synthetic direct follow-up documented.',safetyFollowUpConfirmed:true});
    expect(rows[0].payload_encrypted).toBe(original);expect(rows[0].review_encrypted).not.toContain('follow-up');
    expect((await listOutcomeResponses(user,41))[0].review.safetyFollowUpConfirmed).toBe(true);
    await expect(reviewOutcomeResponse(user,41,saved.id,{note:'Replace review',safetyFollowUpConfirmed:true})).rejects.toMatchObject({status:409});
  });
  it('protects review races and requires meaningful review notes',async()=>{
    await saveOutcomeResponse(user,41,input());await expect(reviewOutcomeResponse(user,41,1,{note:'   '})).rejects.toMatchObject({status:400});
    reviewRace=true;await expect(reviewOutcomeResponse(user,41,1,{note:'Synthetic review'})).rejects.toMatchObject({status:409});
  });
});

describe('NLU pilot persistence', () => {
 const pilotInput = () => ({ ...input(), measureId:'nlu-learning-caregiver', version:getOutcomeMeasure('nlu-learning-caregiver').version, administration:'caregiver', answers:{q1:'2'}, pilotContext:{age:12,observedOn:'2026-01-15',respondentSeries:'caregiver_1',programConfirmed:true} });
 it('rejects a non-NLU client even if the caller supplies an NLU agency id', async () => {
  await expect(saveOutcomeResponse(user,41,{...pilotInput(),agencyId:6})).rejects.toMatchObject({status:403}); expect(rows).toHaveLength(0);
 });
 it('preserves respondent and date in encrypted snapshots and rejects changed retry context', async () => {
  isNluAgency.mockResolvedValue(true); const a=pilotInput();
  const saved=await saveOutcomeResponse(user,41,a);
  expect(saved.pilotContext).toMatchObject({respondentSeries:'caregiver_1',observedOn:'2026-01-15'});
  expect(saved.result.total).toBeNull();expect(rows[0].payload_encrypted).not.toContain('caregiver_1');
  expect((await saveOutcomeResponse(user,41,a)).id).toBe(saved.id);
  await expect(saveOutcomeResponse(user,41,{...a,pilotContext:{...a.pilotContext,respondentSeries:'caregiver_2'}})).rejects.toMatchObject({status:409});
  await expect(saveOutcomeResponse(user,41,{...a,administration:'self'})).rejects.toMatchObject({status:400});
 });
});

it('offers pilots only for authorized NLU client catalogs and leaves generic catalog unchanged', async () => {
 expect((await outcomeCatalogFor(user)).measures).toHaveLength(9);
 expect((await outcomeCatalogFor(user,{clientId:41})).measures).toHaveLength(9);
 isNluAgency.mockResolvedValue(true);
 expect((await outcomeCatalogFor(user,{clientId:41})).measures).toHaveLength(12);
 resolveClientRecordAccess.mockResolvedValue({ok:false,status:403});isNluAgency.mockClear();
 await expect(outcomeCatalogFor(user,{clientId:99})).rejects.toMatchObject({status:403});expect(isNluAgency).not.toHaveBeenCalled();
});
