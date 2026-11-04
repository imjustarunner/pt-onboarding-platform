import { describe, it, expect } from 'vitest';
import { assertHumanAssistantReviewer } from '../assistantHumanReview.service.js';

describe('assistant recommendations preserve human domain permissions', () => {
  const user = { id: 9, role: 'support', email: 'staff@example.invalid', is_active: 1, is_archived: 0, is_assistant_account: 0 };
  const db = grants => ({ execute: async sql => sql.includes('FROM users') ? [[user]] : [[{ user_id: 9, ...grants }]] });
  it('does not grant payroll or billing source mapping access from ordinary support membership', async () => {
    await expect(assertHumanAssistantReviewer(user, { agency_id: 2, task_kind: 'payroll.review' }, db({}))).rejects.toMatchObject({ code: 'HUMAN_REVIEW_SCOPE' });
    await expect(assertHumanAssistantReviewer(user, { agency_id: 2, task_kind: 'billing.review' }, db({}))).rejects.toMatchObject({ code: 'HUMAN_REVIEW_SCOPE' });
  });
  it('permits only the delegated domain', async () => {
    await expect(assertHumanAssistantReviewer(user, { agency_id: 2, task_kind: 'payroll.review' }, db({ has_payroll_access: 1 }))).resolves.toMatchObject({ id: 9 });
    await expect(assertHumanAssistantReviewer(user, { agency_id: 2, task_kind: 'billing.review' }, db({ has_payroll_access: 1 }))).rejects.toMatchObject({ code: 'HUMAN_REVIEW_SCOPE' });
    await expect(assertHumanAssistantReviewer(user, { agency_id: 2, task_kind: 'billing.review' }, db({ has_billing_access: 1 }))).resolves.toMatchObject({ id: 9 });
  });
  const clinicalProposal={agency_id:2,source_id:20,task_kind:'clinical.review'};
  function clinicalDb({role='provider',primary=10,assignments=[],supervisors=[],member=true,enabled=true}={}){
    const provider={...user,role};
    return {execute:async(sql,params)=>{
      if(sql.includes('FROM users'))return [[provider]];
      if(sql.includes('FROM user_agencies'))return [member?[{user_id:9}]:[]];
      if(sql.includes('FROM agencies'))return [[{id:2,feature_flags:{medicalBillingEnabled:enabled}}]];
      if(sql.includes('FROM clients c')){
        expect(params).toEqual([20,2,9,9,9]);
        expect(sql).toContain('c.agency_id=?');
        expect(sql).toContain('cpa.is_active=1');
        expect(sql).toContain('sa.agency_id=c.agency_id');
        expect(sql).toContain("sa.supervisor_type IN ('clinical','billing')");
        const assigned=[primary,...assignments.filter(a=>a.active).map(a=>a.provider)];
        const allowed=assigned.includes(9)||supervisors.some(s=>s.supervisor===9&&s.agency===2&&['clinical','billing'].includes(s.type)&&assigned.includes(s.supervisee));
        return [allowed?[{id:20}]:[]];
      }
      throw Error('Unexpected clinical reviewer query');
    }};
  }
  it('includes an active secondary treating clinician',async()=>{
    await expect(assertHumanAssistantReviewer(user,clinicalProposal,clinicalDb({assignments:[{provider:9,active:true}]}))).resolves.toMatchObject({id:9});
  });
  it.each(['clinical','billing'])('includes the assigned %s supervisor of a current treating clinician',async type=>{
    await expect(assertHumanAssistantReviewer(user,clinicalProposal,clinicalDb({role:'supervisor',assignments:[{provider:11,active:true}],supervisors:[{supervisor:9,supervisee:11,agency:2,type}]}))).resolves.toMatchObject({id:9});
  });
  it('does not include an inactive assignment or a supervisor of an unrelated provider',async()=>{
    await expect(assertHumanAssistantReviewer(user,clinicalProposal,clinicalDb({assignments:[{provider:9,active:false}]}))).rejects.toMatchObject({code:'CLINICAL_REVIEW_SCOPE'});
    await expect(assertHumanAssistantReviewer(user,clinicalProposal,clinicalDb({role:'supervisor',supervisors:[{supervisor:9,supervisee:99,agency:2,type:'clinical'}]}))).rejects.toMatchObject({code:'CLINICAL_REVIEW_SCOPE'});
    await expect(assertHumanAssistantReviewer(user,clinicalProposal,clinicalDb({role:'supervisor',supervisors:[{supervisor:9,supervisee:10,agency:6,type:'clinical'}]}))).rejects.toMatchObject({code:'CLINICAL_REVIEW_SCOPE'});
  });
  it('retains agency membership and clinical feature gates for providers and the owner',async()=>{
    await expect(assertHumanAssistantReviewer(user,clinicalProposal,clinicalDb({primary:9,member:false}))).rejects.toMatchObject({code:'HUMAN_REVIEW_SCOPE'});
    await expect(assertHumanAssistantReviewer(user,clinicalProposal,clinicalDb({primary:9,enabled:false}))).rejects.toMatchObject({code:'CLINICAL_REVIEW_UNAVAILABLE'});
    await expect(assertHumanAssistantReviewer(user,clinicalProposal,clinicalDb({role:'super_admin',enabled:false}))).rejects.toMatchObject({code:'CLINICAL_REVIEW_UNAVAILABLE'});
  });
});
