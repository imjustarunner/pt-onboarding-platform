import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../scheduleCalendarPolicy.service.js',()=>({googleScheduleAllowedForEmail:vi.fn(async()=>true),GOOGLE_SCHEDULE_DISABLED:{ok:false,skipped:true}}));
vi.mock('../googleWorkspaceAuth.service.js',()=>({GOOGLE_WORKSPACE_SCOPES:[],parseGoogleWorkspaceServiceAccountFromEnv:vi.fn(),getWorkspaceClientsForEmployee:async()=>({calendar:{events:{get:m.get}}}),logGoogleUnauthorizedHint:vi.fn()}));
import GoogleCalendarService from '../googleCalendar.service.js';
it('retains verified Google Meet phone entry points in the Calendar read response',async()=>{
 vi.spyOn(GoogleCalendarService,'isConfigured').mockReturnValue(true);
 m.get.mockResolvedValue({data:{id:'event',status:'confirmed',start:{dateTime:'2030-01-01T18:00:00Z'},end:{dateTime:'2030-01-01T19:00:00Z'},conferenceData:{entryPoints:[{entryPointType:'video',uri:'https://meet.google.com/abc-defg-hij'},{entryPointType:'phone',uri:'tel:+15555550100',pin:'123456789'}]}}});
 const result=await GoogleCalendarService.getEvent({subjectEmail:'provider@example.test',eventId:'event'});
 expect(result.event.googleConference).toMatchObject({meetLink:'https://meet.google.com/abc-defg-hij',phones:[{number:'+15555550100',pin:'123456789'}]});
 expect(m.get).toHaveBeenCalledWith(expect.objectContaining({eventId:'event',fields:expect.stringContaining('conferenceData')}),{timeout:5000,retry:false});
});
