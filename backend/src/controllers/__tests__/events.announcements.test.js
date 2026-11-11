import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../services/companyEventAudience.service.js',()=>({isCompanyEventInvitee:vi.fn()}));
import pool from '../../config/database.js';
import {isCompanyEventInvitee} from '../../services/companyEventAudience.service.js';
import {listMyEventAnnouncements} from '../companyEventAnnouncements.controller.js';
const announcement={id:'a1',scheduledAt:'2026-11-11T16:00:00Z',endsAt:'2026-11-12T16:00:00Z',content:'Current details'};
const row={id:7,agency_id:2,is_active:1,title:'Anniversary',notification_id:401,notification_title:'Old heading',message:'Stale details',
  audience_json:{displayType:'splash',announcementId:'a1',navigationUrl:'https://app.example.com/company-events/7/staff/private'},operations_json:{dashboardAnnouncements:[announcement]}};
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime('2026-11-11T18:00:00Z');isCompanyEventInvitee.mockResolvedValue(true);pool.execute.mockResolvedValue([[structuredClone(row)]]);});
afterEach(()=>vi.useRealTimers());
async function invoke(){const res={json:vi.fn(),set:vi.fn()},next=vi.fn();await listMyEventAnnouncements({user:{id:5}},res,next);expect(next).not.toHaveBeenCalled();return res;}
describe('scheduled private event splashes',()=>{
  it('returns the notification id for dismissal and current event content',async()=>{
    const res=await invoke();expect(res.json).toHaveBeenCalledWith([{id:401,title:'Anniversary',message:'Current details',url:row.audience_json.navigationUrl}]);
    expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');expect(pool.execute.mock.calls[0][1]).toEqual([5]);
  });
  it('omits a person who no longer belongs to the invited audience',async()=>{isCompanyEventInvitee.mockResolvedValue(false);expect((await invoke()).json).toHaveBeenCalledWith([]);});
  it.each([
    {name:'future',change:{scheduledAt:'2026-11-12T16:00:00Z'}},
    {name:'expired',change:{endsAt:'2026-11-11T17:00:00Z'}}
  ])('does not serve a $name announcement',async({change})=>{
    pool.execute.mockResolvedValue([[{...row,operations_json:{dashboardAnnouncements:[{...announcement,...change}]}}]]);
    expect((await invoke()).json).toHaveBeenCalledWith([]);expect(isCompanyEventInvitee).not.toHaveBeenCalled();
  });
  it('does not retain a deleted schedule because its old unread notification still exists',async()=>{
    pool.execute.mockResolvedValue([[{...row,operations_json:{dashboardAnnouncements:[]}}]]);expect((await invoke()).json).toHaveBeenCalledWith([]);
  });
  it('deduplicates old notifications for the same currently scheduled announcement',async()=>{
    pool.execute.mockResolvedValue([[row,{...row,notification_id:400}]]);expect((await invoke()).json.mock.calls[0][0]).toHaveLength(1);
  });
});
