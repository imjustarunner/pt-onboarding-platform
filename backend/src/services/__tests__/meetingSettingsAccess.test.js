import {beforeEach,describe,it,expect,vi} from 'vitest';
const db=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:db}));
import {assertMeetingCompensationSetting} from '../meetingSettings.service.js';
beforeEach(()=>{vi.clearAllMocks();db.execute.mockResolvedValue([[]]);});
describe('meeting compensation administration',()=>{
 it('rejects a participant enabling their own paid meeting',async()=>{await expect(assertMeetingCompensationSetting({agencyId:2,role:'provider',input:{compensation:true}})).rejects.toMatchObject({status:403});});
 it('preserves approved type defaults without allowing the scheduler to change them',async()=>{await expect(assertMeetingCompensationSetting({agencyId:2,role:'provider',type:'huddle',input:{compensation:true}})).resolves.toBeUndefined();await expect(assertMeetingCompensationSetting({agencyId:2,role:'provider',existing:{meeting_settings_json:{compensation:true}},input:{compensation:false}})).rejects.toMatchObject({status:403});});
 it('allows an administrator to choose compensation',async()=>{await expect(assertMeetingCompensationSetting({agencyId:2,role:'admin',input:{compensation:true}})).resolves.toBeUndefined();expect(db.execute).not.toHaveBeenCalled();});
});
