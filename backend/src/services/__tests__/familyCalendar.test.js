import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),authorize:vi.fn(),benefit:vi.fn(),client:vi.fn(),save:vi.fn(),list:vi.fn(),get:vi.fn(),eventGet:vi.fn(),eventList:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../familyAuth.service.js',()=>({requireHousehold:mocks.authorize,assertFamilyBenefit:mocks.benefit}));
vi.mock('../family.service.js',()=>({familyTransaction:fn=>fn({execute:mocks.execute}),saveFamilyEntry:mocks.save}));
vi.mock('../googleWorkspaceAuth.service.js',()=>({getWorkspaceClientsForEmployee:mocks.client}));
import {googleFamilyEvent,listFamilyCalendars,connectFamilyCalendar,importFamilyCalendarEvent,visibleGoogleFamilyEvents} from '../familyCalendar.service.js';
beforeEach(()=>{vi.clearAllMocks();mocks.authorize.mockResolvedValue({id:7,role:'parent',timezone:'America/Denver'});mocks.client.mockResolvedValue({calendar:{calendarList:{list:mocks.list},calendars:{get:mocks.get},events:{get:mocks.eventGet,list:mocks.eventList}}});mocks.execute.mockResolvedValue([[{email:'parent@example.com'}]]);});
describe('shared family calendar',()=>{
  it('converts all-day dates in household time, including DST',()=>{
    const e=googleFamilyEvent({id:'a',summary:'Camping',start:{date:'2026-03-08'},end:{date:'2026-03-09'}},'America/Denver');
    expect(e.allDay).toBe(true);expect(e.startAt).toBe('2026-03-08T07:00:00.000Z');expect(e.endAt).toBe('2026-03-09T06:00:00.000Z');
  });
  it('uses the signed-in email and offers primary calendars explicitly but excludes free-busy-only calendars',async()=>{
    mocks.list.mockResolvedValue({data:{items:[{id:'primary',primary:true,accessRole:'owner'},{id:'busy',accessRole:'freeBusyReader'},{id:'family',summary:'Our family',accessRole:'reader'}]}});
    expect(await listFamilyCalendars({userId:1},7)).toEqual([{id:'primary',name:undefined,access:'owner',primary:true},{id:'family',name:'Our family',access:'reader'}]);
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
    expect(mocks.benefit).toHaveBeenCalledWith(1,4);expect(mocks.get).toHaveBeenCalledWith({calendarId:'shared'},{timeout:10000});
    expect(mocks.save.mock.calls[0][2]).toMatchObject({title:'Soccer',memberUserId:3,metadata:{eventType:'camping',artworkVariant:'camping-backyard'}});
  });
});

const vince={id:'vince-google',summary:'Get Vince',start:{dateTime:'2026-09-24T18:15:00Z'},end:{dateTime:'2026-09-24T21:15:00Z'}};
function sources({connection=null,publication={id:8,google_calendar_id:'published-family',google_subject:'family-owner@example.com',google_name:'Mendez Family'},mirrors=[],links=[]}={}){
  mocks.execute.mockImplementation(async sql=>{
    if(sql.includes('FROM calendar_publication_events'))return [mirrors];
    if(sql.includes('FROM calendar_publications'))return [publication?[publication]:[]];
    if(sql.includes('FROM family_calendar_connections'))return [connection?[connection]:[]];
    if(sql.includes('FROM family_google_event_links'))return [links];
    if(sql.includes('SELECT email FROM users'))return [[{email:'parent@example.com'}]];
    return [[]];
  });
  mocks.eventList.mockResolvedValue({data:{items:[vince]}});
}
const range=[new Date('2026-09-21T00:00:00Z'),new Date('2026-09-28T00:00:00Z')];
describe('live Google family sources',()=>{
 it('reads events created directly in the published Family calendar without an incoming connection',async()=>{
   sources();const events=await visibleGoogleFamilyEvents({userId:1,agencyId:4},7,...range);
   expect(events).toMatchObject([{title:'Get Vince',start:'2026-09-24T18:15:00Z',source:'Google',metadata:{autoTheme:true}}]);
   expect(mocks.client).toHaveBeenCalledWith({subjectEmail:'family-owner@example.com'});
   expect(mocks.execute.mock.calls.find(([sql])=>sql.includes('FROM calendar_publications'))[1]).toEqual([7,4]);
 });
 it('keeps the app event once by excluding exported copies, including a pending link write',async()=>{
   sources({mirrors:[{google_event_id:'app-copy'}]});
   mocks.eventList.mockResolvedValue({data:{items:[vince,{...vince,id:'app-copy'},{...vince,id:'pending-copy',extendedProperties:{private:{plotCalendar:'1',eventKey:'family:7:99'}}}]}});
   expect(await visibleGoogleFamilyEvents({userId:1,agencyId:4},7,...range)).toHaveLength(1);
 });
 it('reads a selected primary calendar as well as the family calendar without collapsing distinct events',async()=>{
   sources({connection:{calendar_id:'primary',calendar_name:'My calendar',connected_by_user_id:1}});
   const events=await visibleGoogleFamilyEvents({userId:1,agencyId:4},7,...range);
   expect(events).toHaveLength(2);expect(new Set(events.map(e=>e.key)).size).toBe(2);
   expect(mocks.eventList.mock.calls.map(([p])=>p.calendarId)).toEqual(['published-family','primary']);
 });
 it('reads a shared calendar only once if it is also selected as the incoming calendar',async()=>{
   sources({connection:{calendar_id:'published-family',connected_by_user_id:1}});
   expect(await visibleGoogleFamilyEvents({userId:1,agencyId:4},7,...range)).toHaveLength(1);
   expect(mocks.eventList).toHaveBeenCalledTimes(1);
 });
 it('keeps the working source visible if another source fails and returns a useful warning',async()=>{
   sources({connection:{calendar_id:'primary',calendar_name:'My calendar',connected_by_user_id:1}});
   mocks.eventList.mockImplementation(async({calendarId})=>{if(calendarId==='primary')throw Error('Google unavailable');return {data:{items:[vince]}};});
   const warnings=[];expect(await visibleGoogleFamilyEvents({userId:1,agencyId:4},7,...range,{warnings})).toHaveLength(1);
   expect(warnings[0]).toContain('My calendar could not be refreshed');
 });
 it('requires household membership before using the publication owner',async()=>{
   sources();mocks.authorize.mockRejectedValue(Error('Not a member'));
   await expect(visibleGoogleFamilyEvents({userId:99,agencyId:4},7,...range)).rejects.toThrow('Not a member');
   expect(mocks.client).not.toHaveBeenCalled();
 });
});
