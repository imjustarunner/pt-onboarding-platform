import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),member:vi.fn(),assigned:vi.fn(),list:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{supervisorHasAccess:m.assigned}}));
vi.mock('../../models/SupervisionSession.model.js',()=>({default:{listSessionsForSuperviseeWithArtifacts:m.list}}));
vi.mock('../../services/meetingJoinPolicy.service.js',()=>({hasActiveMeetingMembership:m.member,roomUnavailable:vi.fn(),requirePersonalSupervisionInvitation:vi.fn()}));
import {getSuperviseeSessions} from '../supervisionSessions.controller.js';
const res=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[]]);m.member.mockResolvedValue(true);m.assigned.mockResolvedValue(true);m.list.mockResolvedValue([]);});
describe('supervision history access',()=>{
 it.each([{id:7,role:'provider'},{id:8,role:'provider'},{id:9,role:'admin'}])('allows an assigned supervisor, the supervisee, and agency admin: %j',async user=>{
  const r=res(),next=vi.fn();await getSuperviseeSessions({params:{superviseeId:'8'},query:{agencyId:'2'},user},r,next);
  expect(next).not.toHaveBeenCalled();expect(r.status).not.toHaveBeenCalled();expect(m.list).toHaveBeenCalledWith({superviseeUserId:8,agencyId:2,limit:50});
 });
 it('denies another supervisor without an assignment',async()=>{m.assigned.mockResolvedValue(false);const r=res();await getSuperviseeSessions({params:{superviseeId:'8'},query:{agencyId:'2'},user:{id:7,role:'provider'}},r,vi.fn());expect(r.status).toHaveBeenCalledWith(403);expect(m.list).not.toHaveBeenCalled();});
 it('denies inactive membership even for an administrator',async()=>{m.member.mockResolvedValue(false);const r=res();await getSuperviseeSessions({params:{superviseeId:'8'},query:{agencyId:'2'},user:{id:7,role:'admin'}},r,vi.fn());expect(r.status).toHaveBeenCalledWith(403);expect(m.list).not.toHaveBeenCalled();});
 it('requires a tenant instead of choosing one from someone else’s session',async()=>{const r=res();await getSuperviseeSessions({params:{superviseeId:'8'},query:{},user:{id:7,role:'provider'}},r,vi.fn());expect(r.status).toHaveBeenCalledWith(400);expect(m.list).not.toHaveBeenCalled();});
});
