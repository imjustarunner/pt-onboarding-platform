import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import {googleMeetingConference,currentGoogleConference,googleDialInContent} from '../googleMeetingConference.service.js';
import {optionalGoogleMeetingDialIn} from '../googleMeetingDialIn.service.js';
const raw={conferenceData:{entryPoints:[{entryPointType:'video',uri:'https://meet.google.com/abc-defg-hij'},{entryPointType:'phone',uri:'tel:+1-555-555-0100',pin:'123 456 789',label:'US'}]}};
it('keeps only Google-provided phone details attached to a valid Google Meet conference',()=>{
 const info=googleMeetingConference(raw);expect(info.phones[0]).toMatchObject({number:'+1-555-555-0100',pin:'123456789'});
 expect(googleDialInContent({...info,status:'available'}).html).toContain('Google Meet PIN');
 expect(googleDialInContent({...info,status:'not_verified'})).toBeNull();
 expect(googleMeetingConference({conferenceData:{entryPoints:[raw.conferenceData.entryPoints[1]]}}).phones).toEqual([]);
 expect(googleMeetingConference({hangoutLink:'javascript:alert(1)',conferenceData:{entryPoints:[raw.conferenceData.entryPoints[1]]}}).phones).toEqual([]);
});
it('reports availability from the current event without changing Google settings or creating conferences',async()=>{
 const event=vi.fn(async()=>({ok:true,event:{status:'confirmed',startAt:'2030-01-01T18:00:00Z',endAt:'2030-01-01T19:00:00Z',googleConference:googleMeetingConference(raw)}}));
 const input={providerUserId:20,eventId:'g-event',startAt:'2030-01-01 18:00:00',endAt:'2030-01-01 19:00:00',meetLink:'https://meet.google.com/abc-defg-hij'};
 const d={user:async()=>({email:'synthetic@example.test'}),event};
 expect((await currentGoogleConference(input,d)).status).toBe('available');
 expect(event).toHaveBeenCalledWith({subjectEmail:'synthetic@example.test',eventId:'g-event'});
 expect((await currentGoogleConference({...input,startAt:'2030-01-01 20:00:00'},d)).status).toBe('not_verified');
 event.mockResolvedValue({ok:true,event:{status:'cancelled'}});expect((await currentGoogleConference(input,d)).status).toBe('not_available');
 event.mockResolvedValue({ok:false});expect((await currentGoogleConference(input,d)).status).toBe('not_verified');
});
it('includes Google phone details only for an opted-in Google meeting and an invited recipient',async()=>{
 const event={id:1,agency_id:6,provider_id:20,google_event_id:'google-id',google_meet_link:raw.conferenceData.entryPoints[0].uri,platform_video_link:0,meeting_settings_json:{includeGoogleDialIn:true}};
 const db={execute:vi.fn(async()=>[[{id:1}]])},conference=vi.fn(async()=>({...googleMeetingConference(raw),status:'available'}));
 expect((await optionalGoogleMeetingDialIn(event,9,{db,conference})).provider).toBe('google_meet');
 db.execute.mockResolvedValue([[]]);expect(await optionalGoogleMeetingDialIn(event,99,{db,conference})).toBeNull();
 conference.mockClear();
 expect(await optionalGoogleMeetingDialIn({...event,platform_video_link:1},9,{db,conference})).toBeNull();
 expect(await optionalGoogleMeetingDialIn({...event,meeting_settings_json:{}},9,{db,conference})).toBeNull();
 expect(conference).not.toHaveBeenCalled();
});
