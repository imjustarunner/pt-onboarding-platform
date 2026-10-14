import { describe, it, expect } from 'vitest';
import { meetingAudienceGroups } from '../meetingAudienceGroups.js';
const agencies = [{id:2,name:'ITSCO'},{id:3,name:'Next Level Up'}];
const users = [
 {id:1,role:'provider',agencyIds:[2]},
 {id:2,role:'provider_plus',agencyIds:[2,3]},
 {id:3,role:'support',agencyIds:[3]},
 {id:4,role:'provider',agencyIds:[2],is_demo:1}
];
describe('automatic meeting audiences', () => {
 it('includes clinical roles and people with provider access without including every administrator', () => {
  const groups=meetingAudienceGroups([
   {id:1,role:'intern',agencyIds:[2]},
   {id:2,role:'admin',agencyIds:[2],hasProviderAccess:true},
   {id:3,role:'admin',agencyIds:[2]},
   {id:4,role:'supervisor',agencyIds:[2]}
  ],agencies);
  expect(groups.find(g=>g.key==='role:providers').userIds).toEqual([1,2,4]);
 });
 it('includes affiliated providers once in the aggregate, separates tenants, and excludes demo accounts', () => {
  const groups=meetingAudienceGroups(users,agencies);
  expect(groups.find(g=>g.key==='role:providers').userIds).toEqual([1,2]);
  expect(groups.find(g=>g.key==='agency:3:providers')).toMatchObject({label:'All providers — Next Level Up',userIds:[2]});
  expect(groups.find(g=>g.key==='agency:2:providers').userIds).toEqual([1,2]);
  expect(groups.flatMap(g=>g.userIds)).not.toContain(4);
 });
 it('reflects membership changes immediately and builds staff and supervision groups for each tenant', () => {
  const groups=meetingAudienceGroups([...users,{id:5,role:'provider',agencyIds:[3]}],agencies,[{agency_id:3,supervisor_id:2,supervisee_id:5}]);
  expect(groups.find(g=>g.key==='agency:3:providers').userIds).toEqual([2,5]);
  expect(groups.find(g=>g.key==='agency:3:staff').userIds).toEqual([2,3,5]);
  expect(groups.find(g=>g.key==='agency:3:supervisees').userIds).toEqual([5]);
  expect(groups.find(g=>g.key==='agency:2:supervisees')).toBeUndefined();
 });
});
