import {expect,it,vi} from'vitest';
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn()}}));
import{administratorTaskAgency,canAdministerTask,scopeTaskAssignment}from'../taskAdministratorAccess.service.js';
const user={id:1807,role:'admin'},users={getAgencies:vi.fn(async id=>id===1807?[{id:453,is_active:1},{id:454,is_active:1}]:id===1496?[{id:453,is_active:1}]:[{id:6,is_active:1}])};
it('uses actual target organization membership rather than the ambient QA agency header',async()=>{
 expect(await canAdministerTask(user,{assigned_to_agency_id:453},users)).toBe(true);
 expect(await canAdministerTask(user,{assigned_to_agency_id:6},users)).toBe(false);
 expect(await canAdministerTask(user,{assigned_to_agency_id:null,assigned_to_user_id:1496},users)).toBe(false);
 await expect(administratorTaskAgency(user,6,users)).rejects.toMatchObject({status:403});
});
it('preserves explicit platform administration without treating staff as administrators',async()=>{
 expect(await canAdministerTask({role:'super_admin'},{assigned_to_agency_id:6},users)).toBe(true);
 expect(await canAdministerTask({id:1807,role:'staff'},{assigned_to_agency_id:453},users)).toBe(false);
});
it('scopes new individual and bulk task assignments and rejects foreign employees',async()=>{
 const req={user,headers:{'x-agency-id':'453'},body:{assignedToUserId:1496}};
 await scopeTaskAssignment(req,users);expect(req.body.assignedToAgencyId).toBe(453);
 await expect(scopeTaskAssignment({user,headers:{'x-agency-id':'453'},body:{assignedToUserIds:[1496,99]}},users)).rejects.toMatchObject({status:403});
 await expect(scopeTaskAssignment({user,body:{assignedToAgencyId:6}},users)).rejects.toMatchObject({status:403});
});
it('does not authorize archived or inactive organizations',async()=>{
 const inactive={getAgencies:async()=>[{id:453,is_active:0},{id:454,is_active:1,is_archived:1}]};
 expect(await canAdministerTask(user,{assigned_to_agency_id:453},inactive)).toBe(false);
});
