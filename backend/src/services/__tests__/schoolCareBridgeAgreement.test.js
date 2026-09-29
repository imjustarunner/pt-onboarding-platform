import {describe,it,expect,vi} from 'vitest';
import {ITSCO_TRIAL_TERMS,normalizeAgreementTerms,renderSchoolCareBridgeAgreement,agreementHash,issueAgreement} from '../schoolCareBridgeAgreement.service.js';
const row={id:4,agency_id:2,name:'ITSCO',revision:1,status:'draft',terms_json:ITSCO_TRIAL_TERMS};
const html=renderSchoolCareBridgeAgreement({agencyName:'ITSCO',terms:ITSCO_TRIAL_TERMS});
function fixture(overrides={}){
 const conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn()};let doc=100,task=200;
 conn.execute.mockImplementation(async(sql,args)=>{
  if(sql.includes('FOR UPDATE'))return [[{...row,...overrides.row}]];
  if(sql.includes('schoolcarebridge_program_config'))return [overrides.noOperator?[]:[{id:3,name:'MH4Kidz'}]];
  if(sql.includes('SELECT u.id'))return [overrides.noMember?[]:[{id:args[0]}]];
  if(sql.startsWith('INSERT INTO user_specific_documents'))return [{insertId:++doc}];
  if(sql.startsWith('INSERT INTO tasks')){if(overrides.failSecond&&task===201)throw Error('storage unavailable');return [{insertId:++task}];}
  return [{affectedRows:1}];
 });
 return {conn,db:{getConnection:async()=>conn},args:{agreementId:4,expectedRevision:1,agencySignerId:20,operatorSignerId:30,actorUserId:1,expectedHash:agreementHash(html)}};
}
describe('SchoolCareBridge agreement',()=>{
 it('uses a six-month free period and does not authorize automatic conversion',()=>{expect(normalizeAgreementTerms(ITSCO_TRIAL_TERMS)).toEqual(ITSCO_TRIAL_TERMS);expect(html).toContain('2026-10-01 through 2027-03-31');expect(html).toContain('There is no automatic paid conversion');expect(html).toContain('Not set.');expect(html).toContain('Existing agency charges');});
 it.each([{trialEnd:'2026-02-30'},{trialEnd:'2026-01-01'},{monthlyRateCents:-1},{monthlyRateCents:1.5},{cancellationNoticeDays:999}])('rejects invalid terms %j',patch=>{expect(()=>normalizeAgreementTerms({...ITSCO_TRIAL_TERMS,...patch})).toThrow();});
 it('escapes organization names in printable contract HTML',()=>{expect(renderSchoolCareBridgeAgreement({agencyName:'<script>alert(1)</script>',terms:ITSCO_TRIAL_TERMS})).not.toContain('<script>');});
 it('atomically issues identical counterparts with independently assigned signature tasks',async()=>{
  const {db,conn,args}=fixture();const result=await issueAgreement(db,args);expect(result).toEqual({id:4,status:'issued',agencyTaskId:201,operatorTaskId:202});
  const docs=conn.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO user_specific_documents'));expect(docs).toHaveLength(2);expect(docs.map(([,a])=>a[3])).toEqual([html,html]);
  const tasks=conn.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO tasks'));expect(tasks.map(([,a])=>a.slice(2,4))).toEqual([[20,2],[30,3]]);expect(conn.commit).toHaveBeenCalledOnce();expect(conn.rollback).not.toHaveBeenCalled();expect(conn.release).toHaveBeenCalledOnce();
  expect(conn.execute.mock.calls.some(([sql])=>/INSERT INTO (invoices|payments|billing|usage)/.test(sql))).toBe(false);
 });
 it.each([{row:{status:'issued'}},{row:{revision:2}},{noOperator:true},{noMember:true},{failSecond:true}])('rolls back invalid or partial issuance %j',async options=>{const {db,conn,args}=fixture(options);await expect(issueAgreement(db,args)).rejects.toThrow();expect(conn.commit).not.toHaveBeenCalled();expect(conn.rollback).toHaveBeenCalledOnce();expect(conn.release).toHaveBeenCalledOnce();});
 it('rejects a changed preview and duplicate representatives',async()=>{for(const patch of [{expectedHash:'old-hash'},{operatorSignerId:20}]){const {db,conn,args}=fixture();await expect(issueAgreement(db,{...args,...patch})).rejects.toThrow();expect(conn.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);}});
});
