import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),commit:vi.fn(),rollback:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>({...m,beginTransaction:vi.fn(),release:vi.fn()})}}));
vi.mock('../supervisionSignup.service.js',()=>({isSignupOpen:session=>session.signupOpen!==false}));
import {saveSupervisionRsvp} from '../supervisionRsvp.service.js';
const session={id:1,status:'SCHEDULED',start_at:'2099-09-22 18:30:00',attendee_status:'INVITED',is_required:1};
beforeEach(()=>{vi.clearAllMocks();m.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[session]]:[{affectedRows:1}]);});
it('updates only the invited person’s RSVP without recording attendance',async()=>{await saveSupervisionRsvp({sessionId:1,userId:2,response:'declined',reason:'Client appointment conflict'});expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE supervision_session_attendees'),['DECLINED','Client appointment conflict',1,2]);expect(m.commit).toHaveBeenCalledOnce();expect(m.execute.mock.calls.some(([sql])=>sql.includes('attendance_rollups'))).toBe(false);});
it('requires an active agency membership and existing attendee record',async()=>{m.execute.mockResolvedValue([[]]);await expect(saveSupervisionRsvp({sessionId:1,userId:99,response:'accepted'})).rejects.toMatchObject({status:410});expect(m.rollback).toHaveBeenCalled();expect(m.execute.mock.calls[0][0]).toContain('ua.agency_id=s.agency_id');});
it('allows an invited person to change a prior decline',async()=>{m.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[{...session,attendee_status:'DECLINED'}]]:[{affectedRows:1}]);await saveSupervisionRsvp({sessionId:1,userId:2,response:'accepted'});expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE supervision_session_attendees'),['SIGNED_UP',null,1,2]);});
it('does not reopen closed signup or past supervision',async()=>{m.execute.mockResolvedValue([[{...session,enrollment_mode:'signup_only',signupOpen:false}]]);await expect(saveSupervisionRsvp({sessionId:1,userId:2,response:'accepted'})).rejects.toMatchObject({status:409});m.execute.mockResolvedValue([[{...session,start_at:'2020-01-01 12:00:00'}]]);await expect(saveSupervisionRsvp({sessionId:1,userId:2,response:'declined'})).rejects.toMatchObject({status:410});});

it('requires a reason for mandatory attendees and presenters but does not accept optional declines',async()=>{
 await expect(saveSupervisionRsvp({sessionId:1,userId:2,response:'declined'})).rejects.toMatchObject({status:400});
 m.execute.mockResolvedValue([[{...session,is_required:0,is_presenter:1}]]);
 await expect(saveSupervisionRsvp({sessionId:1,userId:2,response:'declined',reason:'  '})).rejects.toMatchObject({status:400});
 m.execute.mockResolvedValue([[{...session,is_required:0}]]);
 await expect(saveSupervisionRsvp({sessionId:1,userId:2,response:'declined'})).rejects.toMatchObject({status:400});
 expect(m.commit).not.toHaveBeenCalled();
});
it('allows optional attendees to RSVP attending without an explanation',async()=>{
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[{...session,is_required:0}]]:[{affectedRows:1}]);
 await saveSupervisionRsvp({sessionId:1,userId:2,response:'accepted'});
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE supervision_session_attendees'),['SIGNED_UP',null,1,2]);
});
