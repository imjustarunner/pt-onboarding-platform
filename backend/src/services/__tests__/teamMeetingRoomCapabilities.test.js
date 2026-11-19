import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../meetingCalendarGuest.service.js',()=>({assertCalendarHost:vi.fn()}));
vi.mock('../meetingDialInPolicy.js',()=>({assertDialInMeeting:vi.fn(),dialInConfigured:vi.fn()}));
import {teamMeetingRoomCapabilities} from '../teamMeetingRoomCapabilities.service.js';
let deps;const meeting={id:646,agency_id:463,kind:'TEAM_MEETING',meeting_subtype:'interview'};
beforeEach(()=>{deps={configured:vi.fn(()=>true),dialInMeeting:vi.fn(),calendarHost:vi.fn(async()=>{})};});
it('uses the existing calendar-host and dial-in policies to advertise independent controls',async()=>{
 expect(await teamMeetingRoomCapabilities({meeting,userId:1434},deps)).toEqual({dialIn:true,calendarGuests:true});
 expect(deps.calendarHost).toHaveBeenCalledWith('team-meeting',meeting,1434);
 expect(deps.dialInMeeting).toHaveBeenCalledWith('team-meeting',meeting);
});
it('withholds unsupported telephone access and denied calendar controls without failing the video join',async()=>{
 deps.dialInMeeting.mockImplementation(()=>{throw Object.assign(Error('Pilot disabled'),{status:409});});
 deps.calendarHost.mockRejectedValue(Object.assign(Error('Not calendar host'),{status:403}));
 expect(await teamMeetingRoomCapabilities({meeting,userId:1434},deps)).toEqual({dialIn:false,calendarGuests:false});
});
it('does not probe disabled dial-in infrastructure or grant guest/ended-meeting controls',async()=>{
 deps.configured.mockReturnValue(false);
 expect(await teamMeetingRoomCapabilities({meeting,userId:1434},deps)).toEqual({dialIn:false,calendarGuests:true});expect(deps.dialInMeeting).not.toHaveBeenCalled();
 deps.calendarHost.mockClear();
 for(const args of [{meeting,userId:0},{meeting,userId:1434,isGuest:true},{meeting:{...meeting,meeting_completed_at:'2026-11-19'},userId:1434}])
  expect(await teamMeetingRoomCapabilities(args,deps)).toEqual({dialIn:false,calendarGuests:false});
 expect(deps.calendarHost).not.toHaveBeenCalled();
});

it('bounds an unavailable optional policy source and ignores a late approval',async()=>{
 vi.useFakeTimers();let finish;deps.calendarHost.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 try {
  const pending=teamMeetingRoomCapabilities({meeting,userId:1434},deps);await vi.advanceTimersByTimeAsync(2000);
  const caps=await pending;expect(caps).toEqual({dialIn:true,calendarGuests:false});finish();await Promise.resolve();expect(caps.calendarGuests).toBe(false);
 } finally { vi.useRealTimers(); }
});
