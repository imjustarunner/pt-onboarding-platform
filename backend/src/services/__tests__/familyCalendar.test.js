import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),authorize:vi.fn(),benefit:vi.fn(),client:vi.fn(),save:vi.fn(),list:vi.fn(),get:vi.fn(),eventGet:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../familyAuth.service.js',()=>({requireHousehold:mocks.authorize,assertFamilyBenefit:mocks.benefit}));
vi.mock('../family.service.js',()=>({familyTransaction:fn=>fn({execute:mocks.execute}),saveFamilyEntry:mocks.save}));
vi.mock('../googleWorkspaceAuth.service.js',()=>({getWorkspaceClientsForEmployee:mocks.client}));
import {googleFamilyEvent,listFamilyCalendars,connectFamilyCalendar,importFamilyCalendarEvent} from '../familyCalendar.service.js';
beforeEach(()=>{vi.clearAllMocks();mocks.authorize.mockResolvedValue({id:7,role:'parent',timezone:'America/Denver'});mocks.client.mockResolvedValue({calendar:{calendarList:{list:mocks.list},calendars:{get:mocks.get},events:{get:mocks.eventGet}}});mocks.execute.mockResolvedValue([[{email:'parent@example.com'}]]);});
describe('shared family calendar',()=>{
  it('converts all-day dates in household time, including DST',()=>{
    const e=googleFamilyEvent({id:'a',summary:'Camping',start:{date:'2026-03-08'},end:{date:'2026-03-09'}},'America/Denver');
    expect(e.allDay).toBe(true);expect(e.startAt).toBe('2026-03-08T07:00:00.000Z');expect(e.endAt).toBe('2026-03-09T06:00:00.000Z');
  });
  it('uses the signed-in email and excludes primary/free-busy-only calendars',async()=>{
    mocks.list.mockResolvedValue({data:{items:[{id:'primary',primary:true,accessRole:'owner'},{id:'busy',accessRole:'freeBusyReader'},{id:'family',summary:'Our family',accessRole:'reader'}]}});
    expect(await listFamilyCalendars({userId:1},7)).toEqual([{id:'family',name:'Our family',access:'reader'}]);
    expect(mocks.client).toHaveBeenCalledWith({subjectEmail:'parent@example.com'});
  });
  it('rejects connection to an arbitrary calendar ID',async()=>{
    mocks.list.mockResolvedValue({data:{items:[]}});
    await expect(connectFamilyCalendar({userId:1},7,{calendarId:'someone-else'})).rejects.toThrow('available to your account');
    expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);
  });
  it('rejects nonparent access before contacting Google',async()=>{
    mocks.authorize.mockRejectedValue(Object.assign(new Error('Parent only'),{status:403}));
    await expect(listFamilyCalendars({userId:2},7)).rejects.toMatchObject({status:403});expect(mocks.client).not.toHaveBeenCalled();
  });
  it('rechecks connector access and atomically links an import to prevent duplicate events',async()=>{
    mocks.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM family_calendar_connections')?[[{calendar_id:'shared',connected_by_user_id:1}]]:sql.includes('SELECT calendar_id')?[[{calendar_id:'shared'}]]:sql.includes('INSERT INTO family_google_event_links')?Promise.reject(Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'})):[[{email:'parent@example.com'}]]);
    mocks.eventGet.mockResolvedValue({data:{id:'g1',summary:'Soccer',start:{dateTime:'2026-09-16T17:00:00Z'},end:{dateTime:'2026-09-16T18:00:00Z'}}});
    mocks.save.mockImplementation(async(session,id,body,entryId,afterSave)=>afterSave({execute:mocks.execute},22));
    await expect(importFamilyCalendarEvent({userId:1,agencyId:4},7,{eventId:'g1',memberUserId:3,eventType:'camping',artworkVariant:'camping-backyard'})).rejects.toMatchObject({status:409});
    expect(mocks.benefit).toHaveBeenCalledWith(1,4);expect(mocks.get).toHaveBeenCalledWith({calendarId:'shared'});
    expect(mocks.save.mock.calls[0][2]).toMatchObject({title:'Soccer',memberUserId:3,metadata:{eventType:'camping',artworkVariant:'camping-backyard'}});
  });
});
