import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),resolve:vi.fn(),membership:vi.fn(),generate:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/SupervisionSession.model.js',()=>({default:{resolveByJoinRef:m.resolve}}));
vi.mock('../../models/ProviderScheduleEvent.model.js',()=>({default:{resolveByJoinRef:m.resolve}}));
vi.mock('../meetingJoinPolicy.service.js',()=>({hasActiveMeetingMembership:m.membership,roomUnavailable:row=>row.live_ended_at?{status:410,error:{message:'Ended'}}:null}));
vi.mock('../vonageVideo.service.js',()=>({default:{isVideoConfigured:()=>true,generateToken:m.generate}}));
vi.mock('../video.service.js',()=>({resolveVideoProjectId:()=> 'project'}));
import {calendarMeeting,createCalendarGuest,calendarGuestStatus,assertCalendarHost} from '../meetingCalendarGuest.service.js';
const ref='s'.repeat(32),row={id:9,kind:'TEAM_MEETING',agency_id:3,provider_id:7,join_token:ref,twilio_room_sid:'live'};
beforeEach(()=>{vi.clearAllMocks();m.resolve.mockResolvedValue(row);m.membership.mockResolvedValue(true);m.execute.mockResolvedValue([[{id:3}]]);m.generate.mockReturnValue('token');});
it('rejects numeric and legacy host URLs for anonymous joining',async()=>{await expect(calendarMeeting('team-meeting','9')).rejects.toMatchObject({status:404});await expect(calendarMeeting('team-meeting','h'.repeat(32))).rejects.toMatchObject({status:404});});
it('never maps a calendar guest display name to a user account',async()=>{m.execute.mockImplementation(async sql=>sql.includes('INSERT')?[{insertId:10}]:[[{id:3}]]);const guest=await createCalendarGuest('team-meeting',ref,'Supervisor');expect(guest.credential).toHaveLength(43);const insert=m.execute.mock.calls.find(([sql])=>sql.includes('INSERT'));expect(insert[0]).not.toMatch(/user_id|client_id/);expect(guest.status).toBe('waiting');});
it('only the current host/cohost can admit calendar guests',async()=>{m.execute.mockImplementation(async sql=>sql.includes('is_cohost')?[[]]:[[{id:3}]]);await expect(assertCalendarHost('team-meeting',row,22)).rejects.toMatchObject({status:403});await expect(assertCalendarHost('team-meeting',row,7)).resolves.toBeUndefined();});
it('requires the unguessable visit credential',async()=>{await expect(calendarGuestStatus('team-meeting',ref,4,'')).rejects.toMatchObject({status:403});expect(m.generate).not.toHaveBeenCalled();});
it('keeps anonymous guests uncredited and labels them as guests in SDK metadata',async()=>{m.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM meeting_calendar_guests')?[[{id:4,status:'admitted',display_name:'Pat'}]]:[[{}]]);const result=await calendarGuestStatus('team-meeting',ref,4,'k'.repeat(43),{video:true});expect(result.localName).toBe('Pat (Guest)');const data=JSON.parse(m.generate.mock.calls[0][1].data);expect(data.identity).toBe('calendar-guest-4');expect(data.role).toBe('participant');});
it('denies credentials after the meeting ends',async()=>{m.resolve.mockResolvedValue({...row,live_ended_at:new Date()});await expect(calendarGuestStatus('team-meeting',ref,4,'k'.repeat(43),{video:true})).rejects.toMatchObject({status:410});});

it('respects an ordinary meeting host opening the waiting room, while preserving guest identity',async()=>{m.resolve.mockResolvedValue({...row,waiting_room_enabled:0});m.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM meeting_calendar_guests')?[[{id:4,status:'waiting',display_name:'Pat'}]]:[[{}]]);const result=await calendarGuestStatus('team-meeting',ref,4,'k'.repeat(43),{video:true});expect(result.localName).toBe('Pat (Guest)');expect(m.generate).toHaveBeenCalled();});
