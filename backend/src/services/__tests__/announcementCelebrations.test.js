import {it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:mocks}));
vi.mock('../notificationDispatcher.service.js',()=>({createNotificationAndDispatch:vi.fn()}));
import {getTodayCelebrationBannerItems} from '../agencyAnnouncementAutomation.service.js';
it('returns a separate birthday and anniversary item for every person, retaining both kinds for the same person',async()=>{
 mocks.execute.mockResolvedValueOnce([Array.from({length:5},(_,i)=>({id:i+1,first_name:`Person${i}`,last_name:'Example',profile_photo_path:`${i}.png`}))])
  .mockResolvedValueOnce([[{id:1,first_name:'Person0',last_name:'Example',service_years:1},{id:6,first_name:'Person5',last_name:'Example',service_years:2}]]);
 const items=await getTodayCelebrationBannerItems(2,{birthdayEnabled:true,anniversaryEnabled:true});
 expect(items).toHaveLength(7);expect(items.filter(p=>p.userId===1)).toHaveLength(2);
 expect(mocks.execute.mock.calls[1][1]).toContain('first_client_date');
});
