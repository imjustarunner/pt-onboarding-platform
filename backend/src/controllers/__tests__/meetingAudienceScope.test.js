import { beforeEach,it,expect,vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),agencies:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:m.agencies}}));
vi.mock('../../models/AgencyMeetingInviteGroup.model.js',()=>({default:{listByAgencyIds:async()=>[{id:1,agencyId:2,name:'Legacy demo group',userIds:[999]}]}}));
import { listUserMeetingCandidates } from '../user.controller.js';
beforeEach(()=>{
 vi.clearAllMocks();m.agencies.mockResolvedValue([{id:2},{id:3}]);
 m.execute.mockImplementation(async(sql,args)=>{
  if(sql.includes('FROM users u'))return [[{id:7,first_name:'Real',last_name:'Provider',role:'provider',status:'ACTIVE_EMPLOYEE',sees_clients:1,agency_ids:'3'}]];
  if(sql.includes('SELECT id, name FROM agencies'))return [[{id:2,name:'ITSCO'},{id:3,name:'Next Level Up'}]];
  return [[]];
 });
});
it('limits all-agency groups to the scheduler’s affiliations even for a superadmin and excludes demo/inactive accounts in SQL',async()=>{
 const res={json:vi.fn(),status:vi.fn().mockReturnThis()},next=vi.fn();
 await listUserMeetingCandidates({params:{id:'1'},user:{id:1,role:'super_admin'},query:{allAgencies:'true'}},res,next);
 expect(next).not.toHaveBeenCalled();
 const body=res.json.mock.calls[0][0];expect(body.agencyIds).toEqual([2,3]);
 expect(body.groups.find(g=>g.key==='agency:3:providers')).toMatchObject({label:'All providers — Next Level Up',userIds:[7]});
 expect(body.groups.flatMap(g=>g.userIds)).not.toContain(999);
 const [sql,args]=m.execute.mock.calls.find(([sql])=>sql.includes('FROM users u'));
 expect(sql).toContain('COALESCE(u.is_demo, 0) = 0');expect(sql).toContain('ua.is_active = 1');
 expect(args.slice(0,2)).toEqual([2,3]);
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('FROM agencies')&&!sql.includes('id IN'))).toBe(false);
});

it('builds providers from active sees-clients preferences without returning profile details',async()=>{
 const original=m.execute.getMockImplementation();
 m.execute.mockImplementation(async(sql,args)=>sql.includes('FROM users u')?[[
 {id:7,role:'super_admin',status:'ACTIVE_EMPLOYEE',has_provider_access:1,sees_clients:0,agency_ids:'2'},
 {id:8,role:'provider',status:'PREHIRE_OPEN',sees_clients:1,agency_ids:'2'},
 {id:9,role:'intern',status:'ACTIVE_EMPLOYEE',sees_clients:1,agency_ids:'2,3',availability_details:JSON.stringify({availabilityByAgency:{2:{seesClients:false},3:{seesClients:true}},privateField:'not for coworkers'})}
 ]]:original(sql,args));
 const res={json:vi.fn(),status:vi.fn().mockReturnThis()},next=vi.fn();
 await listUserMeetingCandidates({params:{id:'1'},user:{id:1,role:'super_admin'},query:{allAgencies:'true'}},res,next);
 expect(next).not.toHaveBeenCalled();
 const body=res.json.mock.calls[0][0];
 expect(body.groups.find(g=>g.key==='role:providers').userIds).toEqual([9]);
 expect(body.groups.find(g=>g.key==='agency:2:providers')).toBeUndefined();
 expect(JSON.stringify(body)).not.toContain('privateField');
 expect(body.users.find(u=>u.id===7)).toBeDefined();
});
