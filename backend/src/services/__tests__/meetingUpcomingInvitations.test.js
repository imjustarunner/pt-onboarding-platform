import { beforeEach, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
import {upcomingMeetingInvitations} from '../upcomingMeetingInvitations.service.js';
beforeEach(()=>vi.clearAllMocks());
it('lists one pending invitation per training series and signup groups only inside their window',async()=>{
  m.execute.mockResolvedValueOnce([[{id:1,title:'Skills',series_key:'one',start_at:'2026-10-20 22:00:00',end_at:'2026-10-20 23:00:00',is_required:0},{id:2,title:'Skills',series_key:'one',start_at:'2026-10-21 22:00:00'}]])
    .mockResolvedValueOnce([[{id:3,enrollment_mode:'signup_only',status:'SCHEDULED',start_at:'2026-10-20 20:00:00',end_at:'2026-10-20 21:00:00'},
      {id:4,enrollment_mode:'signup_only',status:'SCHEDULED',start_at:'2026-10-25 20:00:00'},
      {id:5,enrollment_mode:'invited',start_at:'2026-10-21 20:00:00',is_required:1}]]);
  const result=await upcomingMeetingInvitations(7,new Date('2026-10-19T22:00:00Z'));
  expect(result.map(row=>row.id)).toEqual([3,1,5]);expect(result[0]).toMatchObject({signupOnly:true,signupState:'open',required:false});expect(result[2].required).toBe(true);
  for(const [sql,params] of m.execute.mock.calls){expect(sql).toContain('ua.is_active=1');expect(sql).toContain("'family_member'");expect(sql).toContain('u.role IS NOT NULL');expect(params.every(id=>id===7)).toBe(true);}
});
it('does not query an anonymous, invalid, or other caller supplied account',async()=>{
  expect(await upcomingMeetingInvitations(0)).toEqual([]);expect(await upcomingMeetingInvitations('bad')).toEqual([]);expect(m.execute).not.toHaveBeenCalled();
});
