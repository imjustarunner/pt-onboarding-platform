import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {hasExampleRegistrationEmail,isFall2026ColumbiaRegistration,classifyClientTotals,threeMonthsBefore} from '../../utils/clientTotalsHygiene.js';
import {encryptIntakePayload} from '../intakeResponsesEncryption.service.js';
import {buildClientTotalsHygienePlan,loadClientTotalsHygieneEvidence,markIntakeRegistrationDemos,reconcileClientTotals,CLIENT_TOTALS_AUTOMATION} from '../clientTotalsHygiene.service.js';
import {buildReferralTotals} from '../referralTotals.service.js';

const now=new Date('2026-11-25T04:30:00Z'); // November 24 in Denver
const client=(id,extra={})=>({id,agency_id:2,is_demo:0,created_via_dev_fill:0,status:'ACTIVE',client_status_id:4,
  client_status_key:'current',created_at:'2026-01-01T12:00:00Z',last_activity_at:'2026-04-01T12:00:00Z',
  updated_at:'2026-04-01T12:00:00Z',...extra});
const evidence=(extra={})=>({clients:[],registrations:[],contacts:[],activities:[],...extra});
afterEach(()=>vi.unstubAllEnvs());

it('finds reserved mailboxes in secondary contacts and arrays without matching lookalike domains',()=>{
  expect(hasExampleRegistrationEmail({children:[{emergencyContact:{email:'Guardian <OTHER@EXAMPLE.COM>'}}]})).toBe(true);
  for(const value of ['example.com','@example.com','guardian@example.com.evil','guardian@example.company','guardian@sub.example.com','guardian@real-example.com'])expect(hasExampleRegistrationEmail(value)).toBe(false);
});

it('handles large signature images in registration data in linear time',()=>{
  const signature='data:image/png;base64,'+'a'.repeat(300000);
  expect(hasExampleRegistrationEmail({signature,contact:'real@real.test'})).toBe(false);
  expect(hasExampleRegistrationEmail({signature,contact:'parent@example.com'})).toBe(true);
  expect(hasExampleRegistrationEmail(signature+'@example.com.evil')).toBe(false);
});

it('restricts Columbia to the authorized fall 2026 ITSCO group, including secondary affiliations',()=>{
  const c=client(1,{organization_name:'Columbia Elementary',submission_date:'2026-08-01'});
  expect(isFall2026ColumbiaRegistration(c)).toBe(true);
  expect(isFall2026ColumbiaRegistration({...c,submission_date:'2026-07-31'})).toBe(false);
  expect(isFall2026ColumbiaRegistration({...c,submission_date:'2027-01-01'})).toBe(false);
  expect(isFall2026ColumbiaRegistration({...c,agency_id:99})).toBe(false);
  expect(isFall2026ColumbiaRegistration({...c,organization_name:'Other',has_columbia_affiliation:1})).toBe(true);
  expect(isFall2026ColumbiaRegistration({...c,organization_name:'British Columbian School'})).toBe(false);
});

it('uses strictly more than three calendar months, preserves assigned/recent clients and keeps inactive separate from demos',()=>{
  expect(threeMonthsBefore(new Date('2026-05-31T10:00:00Z')).toISOString()).toBe('2026-02-28T10:00:00.000Z');
  const cutoff=threeMonthsBefore(now);
  expect(classifyClientTotals(client(1),{now})).toMatchObject({action:'inactive'});
  expect(classifyClientTotals(client(1,{has_active_assignment:1}),{now})).toBeNull();
  expect(classifyClientTotals(client(1),{now,lastActivityAt:cutoff})).toBeNull();
  expect(classifyClientTotals(client(1,{created_at:now,last_activity_at:null}),{now})).toBeNull();
  expect(classifyClientTotals(client(1,{client_status_key:'inactive'}),{now})).toBeNull();
  expect(classifyClientTotals(client(1,{is_demo:1}),{now})).toBeNull();
  expect(classifyClientTotals(client(1,{has_active_assignment:1}),{now,registrationHasExampleEmail:true})).toMatchObject({action:'demo'});
});

it('decrypts every submitted field and applies a secondary test email to every sibling without leaking PII into the plan',()=>{
  vi.stubEnv('INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));
  const encrypted=encryptIntakePayload({signerEmail:'real@real.test',intakeData:{guardians:[{email:'primary@real.test'},{email:'secondary@example.com'}]}});
  const registration={id:12,activity_at:'2026-11-03T14:00:00Z',payload_encrypted:encrypted.ciphertext,
    payload_iv_b64:encrypted.ivB64,payload_auth_tag_b64:encrypted.authTagB64,payload_key_id:encrypted.keyId};
  const plan=buildClientTotalsHygienePlan(evidence({clients:[client(1),client(2)],registrations:[{...registration,client_id:1},{...registration,client_id:2}]}),{now});
  expect(plan.changes.map(c=>[c.clientId,c.action])).toEqual([[1,'demo'],[2,'demo']]);
  expect(JSON.stringify(plan)).not.toContain('@');
  expect(JSON.stringify(plan)).not.toContain(encrypted.ivB64);
});

it('checks encrypted evidence even when a legacy plaintext signer email is populated',()=>{
  const decrypt=vi.fn(()=>({signer_email:'hidden@example.com'}));
  const plan=buildClientTotalsHygienePlan(evidence({clients:[client(1)],registrations:[{id:9,client_id:1,signer_email:'real@real.test',payload_encrypted:Buffer.from('fake')}]}),{now,decrypt});
  expect(plan.changes[0].action).toBe('demo');
  expect(decrypt.mock.calls[0][0].signer_email).toBeNull();
});

it('keeps clinical activity, paperwork and recent registrations active without changing historical referral totals for inactive real clients',()=>{
  const plan=buildClientTotalsHygienePlan(evidence({clients:[client(1),client(2),client(3),client(4)],
    registrations:[{id:3,client_id:3,signer_email:'real@real.test',activity_at:'2026-11-01T12:00:00Z'}],
    activities:[{client_id:1,activity_at:'2026-10-01T12:00:00Z'},{client_id:2,activity_at:'2026-09-01T12:00:00Z'}]}),{now});
  expect(plan.changes.map(c=>[c.clientId,c.action])).toEqual([[4,'inactive']]);
  const report=buildReferralTotals([{clientId:4,channel:'online',receivedAt:'2026-02-01T12:00:00Z'}],{now});
  expect(report.yearTotal.total).toBe(1);
});

it('fails closed if activity evidence is unavailable and waits for every query before returning',async()=>{
  let finished=false;
  const db={execute:vi.fn(async()=>[[]])};
  const clinicalDb={execute:vi.fn(async()=>{await new Promise(resolve=>setTimeout(resolve,5));finished=true;throw new Error('clinical unavailable');})};
  await expect(loadClientTotalsHygieneEvidence(db,clinicalDb,2,{clientId:7})).rejects.toThrow('clinical unavailable');
  expect(finished).toBe(true);
  for(const [sql,params] of db.execute.mock.calls)expect((sql.match(/\?/g)||[]).length).toBe(params.length);
  expect(db.execute.mock.calls[0][1]).toEqual([2,7]);
});

it('marks linked primary and sibling test records atomically with automation audit actors and rolls back failures',async()=>{
  const calls=[];
  const conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,params)=>{
    calls.push([sql,params]);
    if(sql.includes('FROM intake_submissions s WHERE s.id='))return [[{id:2,signer_email:'test@example.com'}]];
    if(sql.includes('AS has_active_assignment'))return [[client(1),client(2)]];
    return [{affectedRows:1}];
  })};
  expect(await markIntakeRegistrationDemos(2,{db:{getConnection:async()=>conn}})).toEqual({demo:2});
  const audits=calls.filter(([sql])=>sql.includes('INSERT INTO user_activity_log'));
  expect(audits).toHaveLength(2);
  expect(audits.every(([sql])=>sql.includes('NULL'))).toBe(true);
  expect(audits.every(([,p])=>JSON.parse(p[2]).actor_type==='automation')).toBe(true);
  expect(JSON.stringify(audits)).not.toContain('test@example.com');
  expect(conn.commit).toHaveBeenCalledOnce();
  conn.execute.mockRejectedValueOnce(new Error('evidence failed'));
  await expect(markIntakeRegistrationDemos(2,{db:{getConnection:async()=>conn}})).rejects.toThrow('evidence failed');
  expect(conn.rollback).toHaveBeenCalledOnce();
});

it('rechecks assignments under the scheduling lock and leaves newly assigned clients active',async()=>{
  const writes=[];
  const execute=(assigned)=>vi.fn(async(sql,params)=>{
    if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
    if(sql.includes('AS has_active_assignment'))return [[client(1,{has_active_assignment:assigned})]];
    if(sql.startsWith('UPDATE')||sql.includes('INSERT INTO'))writes.push([sql,params]);
    return [[]];
  });
  const conn={execute:execute(1),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
  const result=await reconcileClientTotals({db:{execute:execute(0),getConnection:async()=>conn},clinicalDb:{execute:async()=>[[]]},identity:CLIENT_TOTALS_AUTOMATION,now});
  expect(result).toEqual({demo:0,inactive:0,changedSincePreview:1});
  expect(writes).toEqual([]);
  expect(conn.execute.mock.calls.some(([sql])=>sql.includes('RELEASE_LOCK'))).toBe(true);
});

it('moves eligible real clients to the inactive catalog with null automation actors and retains referral records',async()=>{
  const calls=[];
  const execute=vi.fn(async(sql,params)=>{
    calls.push([sql,params]);
    if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
    if(sql.includes('AS has_active_assignment'))return [[client(1)]];
    if(sql.startsWith('SELECT id FROM client_statuses'))return [[{id:64}]];
    return [[]];
  });
  const conn={execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
  const result=await reconcileClientTotals({db:{execute,getConnection:async()=>conn},clinicalDb:{execute:async()=>[[]]},identity:CLIENT_TOTALS_AUTOMATION,now});
  expect(result.inactive).toBe(1);
  expect(calls.find(([sql])=>sql.startsWith('UPDATE clients'))[1]).toEqual([64,1]);
  expect(calls.some(([sql])=>/^DELETE\b|^UPDATE\s+(?:referral\w*|appointments)\b|^UPDATE.*terminated_at=/s.test(sql))).toBe(false);
  const audit=calls.find(([sql])=>sql.includes('INSERT INTO user_activity_log'));
  expect(JSON.parse(audit[1][2])).toMatchObject({actor_type:'automation',automation_identity:CLIENT_TOTALS_AUTOMATION,after:{status:'ARCHIVED',clientStatusId:64}});
  expect(conn.commit).toHaveBeenCalledOnce();
});
