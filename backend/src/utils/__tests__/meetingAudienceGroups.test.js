import { describe, it, expect } from 'vitest';
import { meetingAudienceGroups } from '../meetingAudienceGroups.js';
const agencies = [{id:2,name:'ITSCO'},{id:3,name:'Next Level Up'}];
const users = [
 {id:1,role:'provider',status:'ACTIVE_EMPLOYEE',seesClients:true,agencyIds:[2]},
 {id:2,role:'provider_plus',status:'ACTIVE_EMPLOYEE',seesClients:true,agencyIds:[2,3]},
 {id:3,role:'support',status:'ACTIVE_EMPLOYEE',seesClients:false,agencyIds:[3]},
 {id:4,role:'provider',status:'ACTIVE_EMPLOYEE',seesClients:true,agencyIds:[2],is_demo:1}
];
describe('automatic meeting audiences', () => {
 it('uses sees-clients rather than role or provider-access permissions', () => {
  const groups=meetingAudienceGroups([
   {id:1,role:'intern',status:'ACTIVE_EMPLOYEE',seesClients:true,agencyIds:[2]},
   {id:2,role:'admin',status:'ACTIVE_EMPLOYEE',seesClients:false,agencyIds:[2],hasProviderAccess:true},
   {id:3,role:'admin',status:'ACTIVE_EMPLOYEE',seesClients:true,agencyIds:[2]},
   {id:4,role:'supervisor',status:'ACTIVE_EMPLOYEE',seesClients:true,agencyIds:[2]}
  ],agencies);
  expect(groups.find(g=>g.key==='role:providers').userIds).toEqual([1,3,4]);
 });
 it('includes affiliated providers once in the aggregate, separates tenants, and excludes demo accounts', () => {
  const groups=meetingAudienceGroups(users,agencies);
  expect(groups.find(g=>g.key==='role:providers').userIds).toEqual([1,2]);
  expect(groups.find(g=>g.key==='agency:3:providers')).toMatchObject({label:'All providers — Next Level Up',userIds:[2]});
  expect(groups.find(g=>g.key==='agency:2:providers').userIds).toEqual([1,2]);
  expect(groups.flatMap(g=>g.userIds)).not.toContain(4);
 });
 it('reflects membership changes immediately and builds staff and supervision groups for each tenant', () => {
  const groups=meetingAudienceGroups([...users,{id:5,role:'provider',status:'ACTIVE_EMPLOYEE',seesClients:true,agencyIds:[3]}],agencies,[{agency_id:3,supervisor_id:2,supervisee_id:5}]);
  expect(groups.find(g=>g.key==='agency:3:providers').userIds).toEqual([2,5]);
  expect(groups.find(g=>g.key==='agency:3:staff').userIds).toEqual([2,3,5]);
  expect(groups.find(g=>g.key==='agency:3:supervisees').userIds).toEqual([5]);
  expect(groups.find(g=>g.key==='agency:2:supervisees')).toBeUndefined();
 });
});

it('honors tenant-specific sees-clients overrides and never leaks another agency into an aggregate',()=>{
 const people=[{id:1,status:'ACTIVE_EMPLOYEE',role:'super_admin',seesClients:true,agencyIds:[2,3],availabilityDetails:{availabilityByAgency:{2:{seesClients:false},3:{seesClients:true}}}},
 {id:2,status:'ACTIVE_EMPLOYEE',role:'provider',seesClients:false,agencyIds:[2],availabilityDetails:JSON.stringify({availabilityByAgency:{3:{seesClients:true}}})}];
 const groups=meetingAudienceGroups(people,agencies);
 expect(groups.find(g=>g.key==='role:providers').userIds).toEqual([1]);
 expect(groups.find(g=>g.key==='agency:2:providers')).toBeUndefined();
 expect(groups.find(g=>g.key==='agency:3:providers').userIds).toEqual([1]);
});
it('keeps prehires and pending accounts out of provider groups until activated',()=>{
 const people=['PREHIRE_OPEN','PENDING_SETUP','ARCHIVED','INACTIVE_EMPLOYEE',null,'ACTIVE_EMPLOYEE'].map((status,i)=>({id:i+1,status,role:'provider',seesClients:true,agencyIds:[2],prelicensedAgencyIds:[2]}));
 const groups=meetingAudienceGroups(people,agencies);
 expect(groups.find(g=>g.key==='role:providers').userIds).toEqual([6]);
 expect(groups.find(g=>g.key==='agency:2:prelicensed').userIds).toEqual([6]);
});
