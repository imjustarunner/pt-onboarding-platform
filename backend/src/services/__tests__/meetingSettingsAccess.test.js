import {beforeEach,describe,it,expect,vi} from 'vitest';
const db=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:db}));
import {assertMeetingCompensationSetting,saveEventMeetingSettings} from '../meetingSettings.service.js';
import {meetingTypeForEvent} from '../meetingSettingsPolicy.js';
beforeEach(()=>{vi.clearAllMocks();db.execute.mockResolvedValue([[]]);});
describe('meeting compensation administration',()=>{
 it.each(['cpa','mentorship'])('preserves customized %s defaults instead of loading huddle defaults',async type=>{
   db.execute.mockResolvedValueOnce([[{type_key:type,settings_json:{agenda:false,reminders:[30]}},{type_key:'huddle',settings_json:{agenda:true,reminders:[5]}}]]);
   const settings=await saveEventMeetingSettings({id:9,agency_id:2,kind:'HUDDLE',meeting_subtype:type},null);
   expect(settings.agenda).toBe(false);expect(settings.reminders).toEqual([30]);
 });
 it('validates CPA compensation against CPA defaults when creating a huddle-kind meeting',async()=>{
   db.execute.mockResolvedValueOnce([[{type_key:'cpa',settings_json:{compensation:false}},{type_key:'huddle',settings_json:{compensation:true}}]]);
   await expect(assertMeetingCompensationSetting({agencyId:2,role:'provider',type:meetingTypeForEvent({kind:'HUDDLE',meeting_subtype:'cpa'}),input:{compensation:false}})).resolves.toBeUndefined();
 });
 it('rejects a participant enabling their own paid meeting',async()=>{await expect(assertMeetingCompensationSetting({agencyId:2,role:'provider',input:{compensation:true}})).rejects.toMatchObject({status:403});});
 it('preserves approved type defaults without allowing the scheduler to change them',async()=>{await expect(assertMeetingCompensationSetting({agencyId:2,role:'provider',type:'huddle',input:{compensation:true}})).resolves.toBeUndefined();await expect(assertMeetingCompensationSetting({agencyId:2,role:'provider',existing:{meeting_settings_json:{compensation:true}},input:{compensation:false}})).rejects.toMatchObject({status:403});});
 it('allows an administrator to choose compensation',async()=>{await expect(assertMeetingCompensationSetting({agencyId:2,role:'admin',input:{compensation:true}})).resolves.toBeUndefined();expect(db.execute).not.toHaveBeenCalled();});
});
