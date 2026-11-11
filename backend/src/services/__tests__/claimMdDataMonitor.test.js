import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({default:{execute:vi.fn()}}));
import { inspectReturnedFields, publicIssuePath, comparePublishedContract, publishedContract, parsePublishedState, summarizePublishedContract } from '../claimMdDataContract.js';
import { observeClaimMdData, recordDataGaps, runClaimMdDataMonitor, dataGapDigest, fetchPublicContract } from '../claimMdDataMonitor.service.js';
import { decryptFamilyBilling } from '../familyBillingEncryption.service.js';

beforeEach(() => { vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64')); });

it('finds fields in every benefit, accepts singleton/array wrappers, and emits no payer values', () => {
  const fields = inspectReturnedFields('eligdata',{result:{elig:[{ins_number:'SECRET_MEMBER',benefit:[{benefit_amount:'15.00'},{extra_payer_detail:'SECRET_VALUE'}]}]}});
  expect(fields).toEqual([{endpoint:'eligdata',path:'elig.benefit.extra_payer_detail',kind:'unrecognized_returned_field'}]);
  expect(JSON.stringify(fields)).not.toContain('SECRET');
  expect(inspectReturnedFields('eligdata',{elig:{ins_number:'ABC'}})).toEqual([]);
});

it('distinguishes unmapped known fields, undocumented fields, and changed types', () => {
  expect(inspectReturnedFields('eligdata',{elig:{plan_number:'P1',ins_number:123,custom:'X'}})).toEqual(expect.arrayContaining([
    {endpoint:'eligdata',path:'elig.plan_number',kind:'returned_field_without_dedicated_mapping'},
    {endpoint:'eligdata',path:'elig.ins_number',kind:'returned_field_type_changed'},
    {endpoint:'eligdata',path:'elig.custom',kind:'unrecognized_returned_field'}
  ]));
});

it('reports bounded inspections as incomplete instead of silently assuming no gaps', () => {
  expect(inspectReturnedFields('eligdata',{elig:[{ins_number:'1'},{ins_number:'2'}]},{maxNodes:2})).toContainEqual({endpoint:'eligdata',path:'$inspection',kind:'response_inspection_incomplete'});
});

it('does not mail patient identifiers embedded in unknown object keys', async () => {
  const issue={endpoint:'eligdata',path:'elig.person_123456789',kind:'unrecognized_returned_field'};
  expect(publicIssuePath(issue)).toMatch(/^unrecognized-field-[0-9a-f]{12}$/);
  expect(publicIssuePath({...issue,path:'$123456789'})).toMatch(/^unrecognized-field-[0-9a-f]{12}$/);
  const db={execute:vi.fn().mockResolvedValue([{affectedRows:1}])};
  await recordDataGaps(2,[{...issue,payerId:'00050'}],db);
  const [sql,params]=db.execute.mock.calls[0];
  expect(sql).toContain('ON DUPLICATE KEY UPDATE');expect(params[1]).toBe('00050');
  expect(JSON.stringify(params)).not.toContain('person_123456789');
  expect(decryptFamilyBilling(params[6],`claimmd-data-gap:${params[2]}`)).toEqual({path:issue.path});
  const email=dataGapDigest([{agency_id:2,payer_id:'00050',endpoint:'eligdata',issue_kind:issue.kind,public_path:params[5]}]);
  expect(email.text).toContain('Payer 00050');expect(email.text).not.toContain('123456789');
});

it('deduplicates by agency, payer, field and issue without including returned values', async () => {
  const db={execute:vi.fn().mockResolvedValue([{affectedRows:1}])},issue={endpoint:'eligdata',path:'elig.plan_number',kind:'returned_field_without_dedicated_mapping',payerId:'SKCO0'};
  await recordDataGaps(2,[issue],db);await recordDataGaps(2,[issue],db);await recordDataGaps(6,[issue],db);await recordDataGaps(2,[{...issue,payerId:'00050'}],db);
  const keys=db.execute.mock.calls.map(c=>c[1][2]);expect(keys[0]).toBe(keys[1]);expect(new Set(keys).size).toBe(3);
});

it('keeps monitoring failures from converting successful billing operations into retryable failures', async () => {
  vi.spyOn(console,'warn').mockImplementation(()=>{});
  const record=vi.fn().mockRejectedValue(Error('SECRET_ERROR'));
  await expect(observeClaimMdData({agencyId:2,endpoint:'eligdata',result:{elig:{unknown:'SECRET'}}},{record})).resolves.toBeUndefined();
  expect(record).toHaveBeenCalledOnce();expect(console.warn.mock.calls.flat().join(' ')).not.toContain('SECRET');
  await observeClaimMdData({agencyId:999,endpoint:'eligdata',result:{unknown:'x'}},{record});expect(record).toHaveBeenCalledOnce();
});

it('reports published but unintegrated read endpoints and new/removed schema fields', () => {
  const changed=structuredClone(publishedContract);changed.endpoints.eligdata.fields['elig.new_field']='string';delete changed.endpoints.eligdata.fields['elig.ins_number'];changed.endpoints.eligdata.fields['elig.ins_dob']='number';changed.endpoints.newservice={fields:{}};
  const issues=comparePublishedContract(changed);
  expect(issues).toContainEqual({endpoint:'claimdata',path:'$endpoint',kind:'available_endpoint_not_integrated'});
  expect(issues).toContainEqual({endpoint:'eligdata',path:'elig.new_field',kind:'new_documented_field'});
  expect(issues).toContainEqual({endpoint:'eligdata',path:'elig.ins_number',kind:'documented_field_removed'});
  expect(issues).toContainEqual({endpoint:'eligdata',path:'elig.ins_dob',kind:'documented_type_changed'});
  expect(issues).toContainEqual({endpoint:'newservice',path:'$endpoint',kind:'new_documented_endpoint'});
});

it('respects the documented string-or-integer webhook identifier alternatives',()=>{
 expect(inspectReturnedFields('webhook',{acct_number:'123',events:{eventid:'456'}})).toEqual([]);
 expect(inspectReturnedFields('webhook',{acct_number:123,events:[{eventid:456}]})).toEqual([]);
});

it('creates a new finding for each later API contract change without repeating the same revision',async()=>{
 const db={execute:vi.fn().mockResolvedValue([{affectedRows:1}])};
 const first=structuredClone(publishedContract),second=structuredClone(publishedContract);
 first.endpoints.eligdata.definitionHash='revision-one';second.endpoints.eligdata.definitionHash='revision-two';
 const a=comparePublishedContract(first).find(i=>i.kind==='documented_contract_changed');
 const b=comparePublishedContract(second).find(i=>i.kind==='documented_contract_changed');
 await recordDataGaps(0,[a],db);await recordDataGaps(0,[a],db);await recordDataGaps(0,[b],db);
 const keys=db.execute.mock.calls.map(c=>c[1][2]);expect(keys[0]).toBe(keys[1]);expect(keys[2]).not.toBe(keys[0]);
});

it('reads only the fixed public documentation host and does not execute scripts or send an AccountKey', async () => {
  const fetch=vi.fn().mockResolvedValueOnce(new Response('<script src="redocly-state-abcd.js"></script>')).mockResolvedValueOnce(new Response('alert("not data");'));
  await expect(fetchPublicContract(fetch)).rejects.toThrow('claimmd_contract_format');
  expect(fetch.mock.calls.map(c=>c[0])).toEqual(['https://api.claim.md/','https://api.claim.md/redocly-state-abcd.js']);
  expect(JSON.stringify(fetch.mock.calls)).not.toContain('AccountKey');
  await expect(fetchPublicContract(async()=>new Response('huge',{headers:{'content-length':'2000001'}}))).rejects.toThrow('too_large');
  expect(()=>parsePublishedState('globalThis.hacked=true')).toThrow();
});

function worker({state={},rows=[{id:1,agency_id:2,payer_id:'SKCO0',endpoint:'eligdata',issue_kind:'unrecognized_returned_field',public_path:'unrecognized-field-abcdef123456'}],sendResult={id:'synthetic-message',communicationId:22}}={}) {
  const now=Date.parse('2026-11-11T12:00:00Z'),events=[];
  const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,params=[])=>{
    expect((sql.match(/\?/g)||[]).length).toBe(params.length);events.push(sql);
    if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
    if(sql.includes('SELECT * FROM claimmd_data_monitor_state'))return [[{catalog_checked_at:new Date(now),...state}]];
    if(sql.includes("WHERE notification_status='pending'"))return [rows];
    return [{affectedRows:1}];
  })};
  const send=vi.fn(async()=>{events.push('SEND');return sendResult;});
  const deps={pool:{getConnection:async()=>db},canRun:async()=>true,now:()=>now,resolveSender:async()=>({identity:{id:8},replyTo:'technology@example.test'}),send,notify:vi.fn().mockResolvedValue({id:12})};
  return {db,send,deps,events};
}

it('durably claims a grouped digest before sending and logs successful delivery', async () => {
  const {db,send,deps,events}=worker();
  expect(await runClaimMdDataMonitor(deps)).toEqual({findings:1,status:'sent'});
  expect(events.findIndex(x=>x.includes("notification_status='sending'"))).toBeLessThan(events.indexOf('SEND'));
  expect(send).toHaveBeenCalledWith(expect.objectContaining({to:'technology@example.test',templateType:'claimmd_data_gap_digest'}));
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('communication_id=?'),['sent',22,expect.any(String)]);
  expect(deps.notify).toHaveBeenCalledOnce();expect(db.release).toHaveBeenCalledOnce();
});

it('defers repeated digests and prevents preview revisions or competing workers from sending', async () => {
  const w=worker({state:{digest_attempted_at:new Date('2026-11-11T11:00:00Z')}});
  expect(await runClaimMdDataMonitor(w.deps)).toEqual({skipped:'daily_digest_cooldown'});expect(w.send).not.toHaveBeenCalled();
  expect(await runClaimMdDataMonitor({...w.deps,canRun:async()=>false})).toEqual({skipped:'inactive_revision'});
  w.db.execute.mockResolvedValueOnce([[{acquired:0}]]);
  expect(await runClaimMdDataMonitor(w.deps)).toEqual({skipped:'already_running'});
});

it('records blocked, queued, and ambiguous sends honestly without declaring an email delivered', async () => {
  for(const [sendResult,status] of [[{blocked:true},'held'],[{queued:true,communicationId:7},'queued'],[{},'unknown']]) {
    const w=worker({sendResult});expect(await runClaimMdDataMonitor(w.deps)).toEqual({findings:1,status});
  }
  const w=worker();w.send.mockRejectedValueOnce(Error('timeout'));
  expect(await runClaimMdDataMonitor(w.deps)).toEqual({findings:1,status:'unknown'});
});

it('records a broken documentation feed as a finding and limits polling to once daily', async () => {
  const w=worker({state:{catalog_checked_at:null},rows:[]});const fetchContract=vi.fn().mockRejectedValue(Error('parse failed'));
  await runClaimMdDataMonitor({...w.deps,fetchContract});
  expect(fetchContract).toHaveBeenCalledOnce();
  expect(w.db.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO claimmd_data_gaps'),expect.arrayContaining(['published_contract_unavailable']));
  expect(w.events.findIndex(s=>s.includes('SET catalog_checked_at'))).toBeLessThan(w.events.findIndex(s=>s.includes('INSERT INTO claimmd_data_gaps')));
});
