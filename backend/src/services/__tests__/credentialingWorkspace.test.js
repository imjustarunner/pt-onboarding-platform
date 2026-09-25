import { describe, it, expect, vi } from 'vitest';
import { credentialingScope, credentialingWorkspace, normalizeCredentialTracking, trackedStatus, saveCredentialingWorkflow } from '../credentialingWorkspace.service.js';

const user = {id:9,role:'staff'};
const input = {version:0,status:'in_review',evidenceReference:'Payer portal reference 123',nextAction:'Check application',followUpDate:'2026-10-01'};
function fixture(){
  const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>sql.includes('SELECT c.id')?[[{id:10,effective_date:'2024-09-15'}]]:sql.startsWith('SELECT')?[[]]:[{affectedRows:1}])};
  const d={grants:vi.fn(async()=>[1]),expand:vi.fn(async()=>[1,3]),billing:vi.fn(async()=>false),connectionMeta:vi.fn(async()=>({configured:true,accountId:'current'})),
    main:{getConnection:vi.fn(async()=>db),execute:vi.fn(async sql=>{
      if(sql.includes('FROM agencies'))return [[{id:1,name:'Agency One'},{id:3,name:'Agency Three'}]];
      if(sql.includes("'provider' AS"))return [[{subjectType:'provider',credentialId:10,agencyId:1,providerId:30,effectiveDate:'2024-09-15',payerDefinitionId:2}]];
      if(sql.includes('FROM credentialing_workflow_tracking'))return [[{agencyId:1,subjectType:'provider',credentialId:10,status:'in_review',version:2}]];
      return [[]];
    })},clinical:{execute:vi.fn(async sql=>sql.includes('FROM claimmd_enrollments')?[[{agencyId:1,connectionId:'account:current',payerId:'COCHA',type:'era',status:'approved'},{agencyId:1,connectionId:'account:old',payerId:'COCHA',type:'era',status:'approved'}]]:[[]])}};
  return {d,db};
}
describe('credentialing management access and projection',()=>{
  it('uses current credentialing grants and active affiliation expansion, not client billing permissions',async()=>{
    const {d}=fixture();const data=await credentialingWorkspace(user,{},d);
    expect(d.grants).toHaveBeenCalledWith(9);expect(d.expand).toHaveBeenCalledWith([1]);
    expect(data.records[0]).toMatchObject({status:'in_review',version:2});
    expect(data.organizations.every(a=>a.canViewBilling===false)).toBe(true);
    expect(data.enrollments).toHaveLength(1);expect(data.enrollments[0]).not.toHaveProperty('connectionId');
    for(const [sql,params] of d.clinical.execute.mock.calls){expect(sql).toContain('agency_id IN (?,?)');expect(params).toEqual([1,3]);expect(sql).not.toMatch(/amount|client_id|claim_payload|tax_id_hash/);}
    const sql=d.main.execute.mock.calls.map(([sql])=>sql).join(' ');expect(sql).not.toMatch(/password|ssn|date_of_birth|SELECT \*/i);
  });
  it('denies providers and staff without grants before querying credential data',async()=>{
    const {d}=fixture();for(const role of ['provider','provider_plus','client'])await expect(credentialingScope({...user,role},null,d)).rejects.toMatchObject({status:403});
    d.expand.mockResolvedValue([]);await expect(credentialingWorkspace(user,{},d)).rejects.toMatchObject({status:403});expect(d.main.execute).not.toHaveBeenCalled();expect(d.clinical.execute).not.toHaveBeenCalled();
  });
  it('denies forged scopes and scopes all operational queries to the requested authorized agency',async()=>{
    const {d}=fixture();for(const agencyId of ['2','999','1 OR 1=1'])await expect(credentialingWorkspace(user,{agencyId},d)).rejects.toMatchObject({status:403});
    expect(d.clinical.execute).not.toHaveBeenCalled();await credentialingWorkspace(user,{agencyId:3},d);
    for(const [,params] of d.clinical.execute.mock.calls)expect(params).toEqual([3]);
  });
  it('reports missing clinical tracking as unavailable rather than connected or zero',async()=>{
    const {d}=fixture();d.clinical.execute.mockRejectedValue({code:'ER_NO_SUCH_TABLE'});
    const result=await credentialingWorkspace(user,{},d);expect(result.capabilities).toEqual({electronicEnrollment:false,claimLinkage:false});
  });
  it('never infers active status from legacy dates',()=>{
    expect(trackedStatus({effectiveDate:'2024-01-01'})).toBe('verification_needed');expect(trackedStatus({effectiveDate:'2024-01-01',returnedDate:'2024-02-01'})).toBe('verification_needed');
  });
});
describe('credentialing updates',()=>{
  it('requires evidence and real calendar dates',()=>{
    for(const bad of [{status:'connected'},{evidenceReference:''},{followUpDate:'2026-02-30'},{billingGroupNpiId:-1}])expect(()=>normalizeCredentialTracking({...input,...bad})).toThrow();
    expect(normalizeCredentialTracking(input)).toMatchObject({followUpDate:'2026-10-01',billingGroupNpiId:null});
  });
  it('locks the source before creating tracking and writes an audit event in the same transaction',async()=>{
    const {d,db}=fixture();expect(await saveCredentialingWorkflow(user,1,'provider',10,input,d)).toEqual({saved:true,version:1});
    expect(db.execute.mock.calls[0][0]).toContain('FOR UPDATE');expect(db.execute.mock.calls[0][1]).toEqual([10,1]);
    const audit=db.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO credentialing_workflow_events'));expect(audit[1].slice(0,4)).toEqual([1,'provider',10,9]);expect(JSON.parse(audit[1][5])).toMatchObject({evidenceReference:input.evidenceReference});expect(db.commit).toHaveBeenCalled();
  });
  it('rejects cross-agency source records and group NPIs without mutation',async()=>{
    const {d,db}=fixture();db.execute.mockResolvedValueOnce([[]]);await expect(saveCredentialingWorkflow(user,1,'provider',11,input,d)).rejects.toMatchObject({status:404});
    await expect(saveCredentialingWorkflow(user,1,'provider',10,{...input,billingGroupNpiId:80},d)).rejects.toMatchObject({status:400});expect(db.commit).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalledTimes(2);
  });
  it('rejects stale writes and active status without an effective date',async()=>{
    const {d,db}=fixture();db.execute.mockImplementation(async sql=>sql.includes('SELECT c.id')?[[{id:10,effective_date:null}]]:sql.includes('SELECT *')?[[{version:2}]]:[[]]);
    await expect(saveCredentialingWorkflow(user,1,'provider',10,input,d)).rejects.toMatchObject({status:409});
    await expect(saveCredentialingWorkflow(user,1,'provider',10,{...input,status:'active'},d)).rejects.toMatchObject({status:409});expect(db.commit).not.toHaveBeenCalled();
  });
  it('does not label a future effective credential active',async()=>{
    const {d,db}=fixture();db.execute.mockResolvedValueOnce([[{id:10,effective_date:'2999-01-01'}]]);
    await expect(saveCredentialingWorkflow(user,1,'provider',10,{...input,status:'active'},d)).rejects.toMatchObject({status:409});expect(db.commit).not.toHaveBeenCalled();
  });
  it('rolls back a status change when the audit event fails',async()=>{
    const {d,db}=fixture();db.execute.mockImplementation(async sql=>{if(sql.includes('workflow_events'))throw new Error('audit failed');return sql.includes('SELECT c.id')?[[{id:10}]]:[[]];});
    await expect(saveCredentialingWorkflow(user,1,'provider',10,input,d)).rejects.toThrow('audit failed');expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalled();
  });
});
