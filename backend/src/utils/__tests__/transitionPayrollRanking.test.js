import { expect,it } from 'vitest';
import { rankPayrollProviders,applyPayrollTransitionRanking } from '../transitionPayrollRanking.js';
import { emptyTransitionState } from '../../content/transitionWeek.js';
const providers=Array.from({length:8},(_,i)=>({id:i+1,name:`Provider ${i+1}`}));
const summary=(id,direct,total=direct)=>({user_id:id,direct_hours:direct,total_hours:total,tier_credits_current:direct,total_units:direct});
const data=people=>({people,payroll:{periods:[{id:3},{id:2},{id:1}],description:'Three fictional payroll periods'}});
it('ranks only providers with payroll activity, keeps decimals and batches five at a time',()=>{
 const rows=rankPayrollProviders(providers,[summary(1,10),summary(1,2.25),summary(2,1.5),summary(3,0,2),summary(4,9),summary(5,3),summary(6,4),summary(7,20),summary(99,1)],[]);
 expect(rows.map(r=>r.providerId)).toEqual([3,2,5,6,4,1,7]);expect(rows.map(r=>r.cohort)).toEqual([1,1,1,1,1,2,2]);
 expect(rows.find(r=>r.providerId===1).directCreditHours).toBe(12.25);
 expect(rows.find(r=>r.providerId===1).periodsWithActivity).toBe(2);
});
it('includes a provider with source service activity and no calculated credits without inventing hours',()=>{
 const rows=rankPayrollProviders(providers,[],[{user_id:3,service_entries:2}]);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({providerId:3,directCreditHours:0,totalCreditHours:0,serviceEntries:2});
});
it('uses total credits/hours then service entries and stable ID to break ties',()=>{
 const rows=rankPayrollProviders(providers,[summary(1,2,4),summary(2,2,3),summary(3,2,3),summary(4,2,3)],[{user_id:2,service_entries:9}]);
 expect(rows.map(r=>r.providerId)).toEqual([3,4,2,1]);
});
it('archives the rejected old group order without reassigning completed work to new people',()=>{
 const state=emptyTransitionState();state.ranking={rows:[{providerId:99,cohort:1}]};state.cohorts={1:{observed:{at:'old'}}};state.workspace.groups={1:{checks:{meeting:{done:true}}}};state.workspace.people={1:{ownerUserId:99}};state.workspace.clients={'1:41':{note:'Retain'}};
 const next=applyPayrollTransitionRanking(state,data(rankPayrollProviders(providers,[summary(1,2)],[])));
 expect(next.ranking.rows[0].providerId).toBe(1);expect(next.workspace.groups).toEqual({});expect(next.cohorts).toEqual({});
 expect(next.rankingHistory[0].ranking).toEqual(state.ranking);expect(next.rankingHistory[0].cohorts).toEqual(state.cohorts);
 expect(next.workspace.people).toEqual(state.workspace.people);expect(next.workspace.clients).toEqual(state.workspace.clients);
 expect(state.ranking.rows[0].providerId).toBe(99);
});
it('retains acceptance for unchanged provider groups and archives it when payroll order changes',()=>{
 const first=applyPayrollTransitionRanking(emptyTransitionState(),data(rankPayrollProviders(providers,[summary(1,1),summary(2,2)],[])));
 first.cohorts={1:{clinical_ready:{evidence:'Checked'}}};first.workspace.groups={1:{note:'Keep'}};
 const same=applyPayrollTransitionRanking(first,data(rankPayrollProviders(providers,[summary(1,3),summary(2,4)],[])));
 expect(same.cohorts).toEqual(first.cohorts);expect(same.rankingHistory).toHaveLength(0);
 const changed=applyPayrollTransitionRanking(first,data(rankPayrollProviders(providers,[summary(2,1),summary(1,2)],[])));
 expect(changed.cohorts).toEqual({});expect(changed.rankingHistory).toHaveLength(1);expect(changed.ranking.key).not.toBe(first.ranking.key);
});
