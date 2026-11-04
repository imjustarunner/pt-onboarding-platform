import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),resolve:vi.fn(),membership:vi.fn(),generate:vi.fn(),reserve:vi.fn(),configured:true}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/SupervisionSession.model.js',()=>({default:{resolveByJoinRef:m.resolve}}));
vi.mock('../../models/ProviderScheduleEvent.model.js',()=>({default:{resolveByJoinRef:m.resolve}}));
vi.mock('../meetingJoinPolicy.service.js',()=>({hasActiveMeetingMembership:m.membership,roomUnavailable:()=>null}));
vi.mock('../vonageVideo.service.js',()=>({default:{isVideoConfigured:()=>true,generateToken:m.generate}}));
vi.mock('../video.service.js',()=>({resolveVideoProjectId:()=> 'project'}));
vi.mock('../meetingDialInPolicy.js',()=>({dialInConfigured:()=>m.configured}));
vi.mock('../supervisionJoinCapacity.service.js',()=>({reserveSupervisionCalendarGuest:m.reserve}));
import {calendarGuestStatus,admitCalendarGuest} from '../meetingCalendarGuest.service.js';
const ref='s'.repeat(32),credential='k'.repeat(43),row={id:9,agency_id:3,supervisor_user_id:7,join_token:ref,twilio_room_sid:'live',waiting_room_enabled:1};
beforeEach(()=>{
 vi.clearAllMocks();m.configured=true;m.resolve.mockResolvedValue(row);m.membership.mockResolvedValue(true);m.generate.mockReturnValue('token');m.reserve.mockImplementation(async()=>({status:'admitted',tokenExpiresAt:Math.floor(Date.now()/1000)+40}));
 m.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM meeting_calendar_guests')?[[{id:4,status:'admitted',display_name:'Pat'}]]:[[{}]]);
});
it('revalidates a guest reservation before token issuance and bounds token expiry to its reservation',async()=>{
 const start=Math.floor(Date.now()/1000);
 await calendarGuestStatus('supervision',ref,4,credential,{video:true});
 expect(m.reserve).toHaveBeenCalledWith({sessionId:9,guestId:4,credentialHash:expect.stringMatching(/^[a-f0-9]{64}$/)});
 expect(m.reserve.mock.invocationCallOrder[0]).toBeLessThan(m.generate.mock.invocationCallOrder[0]);
 expect(m.generate.mock.calls[0][1].expireTime).toBeGreaterThanOrEqual(start+40);
 expect(m.generate.mock.calls[0][1].expireTime).toBeLessThanOrEqual(start+41);
});
it('never issues a token after the current shared capacity or credential check fails',async()=>{
 m.reserve.mockRejectedValue(Object.assign(new Error('Full'),{status:409}));
 await expect(calendarGuestStatus('supervision',ref,4,credential,{video:true})).rejects.toMatchObject({status:409});
 expect(m.generate).not.toHaveBeenCalled();
});
it('does not extend the reserved deadline after a slow policy or storage operation',async()=>{
 const now=Date.now(),clock=vi.spyOn(Date,'now');
 const deadline=Math.floor(now/1000)+40;
 m.reserve.mockImplementation(async()=>{clock.mockReturnValue(now+41000);return {status:'admitted',tokenExpiresAt:deadline};});
 try{
  await expect(calendarGuestStatus('supervision',ref,4,credential,{video:true})).rejects.toMatchObject({status:409});
  expect(m.generate).not.toHaveBeenCalled();
 }finally{clock.mockRestore();}
});
it('uses current host admission and refreshes admitted guest heartbeats under the shared lock',async()=>{
 await admitCalendarGuest('supervision',ref,7,4);
 expect(m.reserve).toHaveBeenCalledWith({sessionId:9,guestId:4,hostUserId:7});
 await calendarGuestStatus('supervision',ref,4,credential);
 expect(m.reserve).toHaveBeenLastCalledWith({sessionId:9,guestId:4,credentialHash:expect.any(String)});
});
it('releases the same guest credential reservation when leaving',async()=>{
 m.reserve.mockResolvedValue({status:'left'});
 await expect(calendarGuestStatus('supervision',ref,4,credential,{leave:true})).resolves.toEqual({status:'left'});
 expect(m.reserve).toHaveBeenCalledWith({sessionId:9,guestId:4,credentialHash:expect.any(String),leave:true});
 expect(m.generate).not.toHaveBeenCalled();
});
it('does not write a stale admitted state after leaving or change a host-admitted waiting heartbeat',async()=>{
 await calendarGuestStatus('supervision',ref,4,credential);
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('UPDATE meeting_calendar_guests'))).toBe(false);
 m.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM meeting_calendar_guests')?[[{id:4,status:'waiting',display_name:'Pat'}]]:[[{}]]);
 await calendarGuestStatus('supervision',ref,4,credential);
 const update=m.execute.mock.calls.find(([sql])=>sql.includes('UPDATE meeting_calendar_guests'));
 expect(update[0]).toContain("AND status='waiting'");expect(update[0].split('WHERE')[0]).not.toContain('status=');
});
it('keeps the existing off-mode and team-meeting guest behavior',async()=>{
 m.configured=false;await calendarGuestStatus('supervision',ref,4,credential,{video:true});
 expect(m.reserve).not.toHaveBeenCalled();expect(m.generate.mock.calls[0][1].expireTime).toBeGreaterThan(Math.floor(Date.now()/1000)+55);
 m.configured=true;m.resolve.mockResolvedValue({...row,kind:'TEAM_MEETING',provider_id:7});
 await calendarGuestStatus('team-meeting',ref,4,credential,{video:true});expect(m.reserve).not.toHaveBeenCalled();
});
