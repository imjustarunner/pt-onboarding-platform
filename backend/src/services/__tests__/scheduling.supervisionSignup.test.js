import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),find:vi.fn(),upsert:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/SupervisionSession.model.js',()=>({default:{findById:m.find,upsertAttendees:m.upsert}}));
import { canUserSignup, isSignupOpen, dismissSupervisionSignup } from '../supervisionSignup.service.js';
const session={id:1,agency_id:2,session_type:'group',enrollment_mode:'signup_only',supervisor_user_id:3,status:'SCHEDULED',start_at:'2026-10-22 00:00:00',end_at:'2026-10-22 01:00:00',signup_closes_at:'2026-10-18 23:00:00'};
beforeEach(()=>{
  vi.clearAllMocks();m.find.mockResolvedValue(session);
  m.execute.mockImplementation(async sql=>sql.startsWith('SELECT u.id')?[[{id:4}]]:sql.startsWith('SELECT status')?[[]]:[{affectedRows:1}]);
});
it('rejects early/late signup regardless of stale stored deadlines and accepts the current window',async()=>{
  expect(await canUserSignup({sessionRow:session,userId:4,now:new Date('2026-10-20T12:00:00Z')})).toEqual({ok:false,reason:'signup_not_open'});
  expect(await canUserSignup({sessionRow:session,userId:4,now:new Date('2026-10-21T12:00:00Z')})).toEqual({ok:true});
  expect(await canUserSignup({sessionRow:session,userId:4,now:new Date('2026-10-21T23:00:00Z')})).toEqual({ok:false,reason:'signup_closed'});
});
it('preserves ordinary invited sessions and hybrid open-join timing',()=>{
  expect(isSignupOpen({...session,enrollment_mode:'invited'},new Date('2026-10-21T12:00:00Z'))).toBe(false);
  expect(isSignupOpen({...session,enrollment_mode:'open_join',invite_scope:'open_to_all'},new Date('2026-10-20T12:00:00Z'))).toBe(true);
});
it('allows an agency member to dismiss one open offering without enrolling or logging attendance',async()=>{
  const result=await dismissSupervisionSignup({sessionId:1,userId:4,now:new Date('2026-10-21T12:00:00Z')});
  expect(result).toEqual({ok:true,response:'declined'});
  expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("VALUES (?,?,'supervisee',0,0,'DECLINED')"),[1,4]);
  expect(m.upsert).not.toHaveBeenCalled();
  expect(m.execute.mock.calls.some(([sql])=>sql.includes('attendance_rollups'))).toBe(false);
});
it('does not let inactive/nonmembers dismiss another agency’s offering',async()=>{
  m.execute.mockResolvedValue([[]]);
  await expect(dismissSupervisionSignup({sessionId:1,userId:4,now:new Date('2026-10-21T12:00:00Z')})).rejects.toMatchObject({status:403});
  expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
it('does not let hosts suppress their required invitation or dismiss after the event begins',async()=>{
  await expect(dismissSupervisionSignup({sessionId:1,userId:3,now:new Date('2026-10-21T12:00:00Z')})).rejects.toMatchObject({status:400});
  await expect(dismissSupervisionSignup({sessionId:1,userId:4,now:new Date('2026-10-22T00:00:00Z')})).rejects.toMatchObject({status:410});
});

it('does not mistake a copied INVITED roster entry for a signup on the new date',async()=>{
 const base=m.execute.getMockImplementation();
 m.execute.mockImplementation(async(sql,args)=>sql.startsWith('SELECT status')?[[{status:'INVITED'}]]:base(sql,args));
 expect(await canUserSignup({sessionRow:session,userId:4,now:new Date('2026-10-21T12:00:00Z')})).toEqual({ok:true});
});
