import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),member:vi.fn(),assigned:vi.fn(),list:vi.fn(),summary:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{supervisorHasAccess:m.assigned}}));
vi.mock('../../models/SupervisionSession.model.js',()=>({default:{listSessionsForSuperviseeWithArtifacts:m.list,getSuperviseeAttendanceSummary:m.summary}}));
vi.mock('../../services/meetingJoinPolicy.service.js',()=>({hasActiveMeetingMembership:m.member,roomUnavailable:vi.fn(),requirePersonalSupervisionInvitation:vi.fn()}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:async()=> 'https://demo.example.com'}));
import {getSuperviseeSessions} from '../supervisionSessions.controller.js';
const res=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[]]);m.member.mockResolvedValue(true);m.assigned.mockResolvedValue(true);m.list.mockResolvedValue([]);m.summary.mockResolvedValue({total:80,attended:60,missed:10,excused:3,cancelled:4,unknown:3});});
describe('supervision history access',()=>{
 it.each([{id:7,role:'provider'},{id:8,role:'provider'},{id:9,role:'admin'}])('allows an assigned supervisor, the supervisee, and agency admin: %j',async user=>{
  const r=res(),next=vi.fn();await getSuperviseeSessions({params:{superviseeId:'8'},query:{agencyId:'2'},user},r,next);
  expect(next).not.toHaveBeenCalled();expect(r.status).not.toHaveBeenCalled();expect(m.list).toHaveBeenCalledWith({superviseeUserId:8,agencyId:2,limit:51,offset:0,includeCancelled:true});
 });
 it('denies another supervisor without an assignment',async()=>{m.assigned.mockResolvedValue(false);const r=res();await getSuperviseeSessions({params:{superviseeId:'8'},query:{agencyId:'2'},user:{id:7,role:'provider'}},r,vi.fn());expect(r.status).toHaveBeenCalledWith(403);expect(m.list).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled();});
 it('denies inactive membership even for an administrator',async()=>{m.member.mockResolvedValue(false);const r=res();await getSuperviseeSessions({params:{superviseeId:'8'},query:{agencyId:'2'},user:{id:7,role:'admin'}},r,vi.fn());expect(r.status).toHaveBeenCalledWith(403);expect(m.list).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled();});
 it('requires a tenant instead of choosing one from someone else’s session',async()=>{const r=res();await getSuperviseeSessions({params:{superviseeId:'8'},query:{},user:{id:7,role:'provider'}},r,vi.fn());expect(r.status).toHaveBeenCalledWith(400);expect(m.list).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled();});
});

it('paginates retained history without dropping the next page or leaking tenants',async()=>{
 const list=Array.from({length:3},(_,index)=>({id:index+1,agencyId:2,startAt:'2026-01-01T16:00:00Z',endAt:'2026-01-01T17:00:00Z',status:'CANCELLED',totalSeconds:0}));
 m.list.mockResolvedValue(list);const r=res(),next=vi.fn();
 await getSuperviseeSessions({params:{superviseeId:'8'},query:{agencyId:'2',page:'2',pageSize:'2'},user:{id:7,role:'provider'}},r,next);
 expect(next).not.toHaveBeenCalled();expect(m.list).toHaveBeenCalledWith({superviseeUserId:8,agencyId:2,limit:3,offset:2,includeCancelled:true});
 expect(r.json.mock.calls[0][0]).toMatchObject({page:2,pageSize:2,hasMore:true,attendanceSummary:{total:80,attended:60,missed:10,excused:3,cancelled:4,unknown:3}});expect(m.summary).toHaveBeenCalledWith({superviseeUserId:8,agencyId:2});expect(r.json.mock.calls[0][0].sessions).toHaveLength(2);
});
it.each([{page:'0'},{page:'1.5'},{pageSize:'101'},{pageSize:'-1'}])('rejects malformed history pagination %j',async query=>{
 const r=res();await getSuperviseeSessions({params:{superviseeId:'8'},query:{agencyId:'2',...query},user:{id:7,role:'provider'}},r,vi.fn());
 expect(r.status).toHaveBeenCalledWith(400);expect(m.list).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled();
});
