import {describe,it,expect,vi,beforeEach} from 'vitest';
import {calendarWindow,workTitle,renderCalendar,googleEventBody} from '../calendarPublicationPolicy.js';
const mocks=vi.hoisted(()=>({execute:vi.fn(),household:vi.fn(),benefit:vi.fn(),familyEvents:vi.fn(),workEvents:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../familyAuth.service.js',()=>({requireHousehold:mocks.household,assertFamilyBenefit:mocks.benefit}));
vi.mock('../calendarEvents.service.js',()=>({familyCalendarEvents:mocks.familyEvents,workCalendarEvents:mocks.workEvents}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(async()=>({id:1,slug:'itsco',custom_domain:'app.itsco.health'}))}}));
import {subscriptionFeed,issueSubscription,revokeSubscription,publicationStatus,assertWorkCalendar} from '../calendarPublication.service.js';
import {tenantMeetingBase} from '../../utils/tenantMeetingUrl.js';
const token='a'.repeat(43),event={key:'family:1:44',title:'Camping',start:'2026-09-20T10:00:00Z',end:'2026-09-20T11:00:00Z'};
beforeEach(()=>{vi.clearAllMocks();mocks.household.mockResolvedValue({id:1,role:'parent'});mocks.benefit.mockResolvedValue({});mocks.familyEvents.mockResolvedValue([event]);mocks.workEvents.mockResolvedValue([event]);});
describe('limited calendar content',()=>{
 it('does not export names, descriptions, private titles or host tokens',()=>{
  const raw={kind:'SESSION',client_id:4,client_initials:'A.B.',title:'Anna Baker trauma follow-up',description:'clinical note',host_join_token:'SECRET'};
  expect(workTitle(raw)).toBe('Session · A.B.');expect(workTitle({...raw,is_private:1})).toBe('Busy');expect(workTitle({...raw,client_initials:'Michael Mendez'})).not.toContain('Michael');
  const exported=JSON.stringify(googleEventBody({...event,...raw,title:workTitle(raw)}));expect(exported).not.toMatch(/Anna|trauma|clinical note|SECRET/);
 });
 it('uses exclusive all-day dates and UTC timed events',()=>{const ics=renderCalendar('Family',[{...event,startDate:'2026-03-08',endDate:'2026-03-09'}, {...event,key:'other'}]);expect(ics).toContain('DTSTART;VALUE=DATE:20260308');expect(ics).toContain('DTEND;VALUE=DATE:20260309');expect(ics).toContain('DTSTART:20260920T100000Z');});
 it('escapes injected ICS fields and folds UTF-8 without breaking characters',()=>{const ics=renderCalendar('Test',[{...event,title:'Birthday 🎂'.repeat(30)+'\nATTENDEE:leak@example.com'}]);for(const line of ics.split('\r\n'))expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);expect(ics).not.toContain('\r\nATTENDEE:');expect(ics).not.toContain('�');});
 it('rejects invalid, backwards and excessive windows',()=>{for(const args of [['oops','2026-01-01'],['2026-02-01','2026-01-01'],['2026-01-01','2028-01-01']])expect(()=>calendarWindow(...args)).toThrow();});
 it('resolves the persisted agency to its dedicated portal',async()=>expect(await tenantMeetingBase(1)).toBe('https://app.itsco.health'));
});
describe('private subscriptions',()=>{
 it('rejects unknown/revoked tokens',async()=>{mocks.execute.mockResolvedValue([[]]);await expect(subscriptionFeed(token)).rejects.toMatchObject({status:404});expect(mocks.familyEvents).not.toHaveBeenCalled();});
 it('rechecks agency benefit and parent membership on every family feed request',async()=>{mocks.execute.mockResolvedValue([[{id:1,calendar_kind:'family',user_id:501,agency_id:1,household_id:1,detail_mode:'limited'}]]);mocks.household.mockRejectedValue(Object.assign(new Error('No access'),{status:403}));await expect(subscriptionFeed(token)).rejects.toMatchObject({status:403});expect(mocks.familyEvents).not.toHaveBeenCalled();});
 it('defaults family exports to limited details',async()=>{mocks.execute.mockResolvedValue([[{id:1,calendar_kind:'family',user_id:501,agency_id:1,household_id:1,detail_mode:'limited'}]]);await subscriptionFeed(token);expect(mocks.familyEvents).toHaveBeenCalledWith(1,expect.any(Date),expect.any(Date),{details:false});});
 it('denies removed employees even with a valid work token',async()=>{mocks.execute.mockImplementation(async sql=>sql.includes('token_hash=?')?[[{user_id:5,agency_id:1,calendar_kind:'work'}]]:[[]]);await expect(subscriptionFeed(token)).rejects.toMatchObject({status:403});expect(mocks.workEvents).not.toHaveBeenCalled();});
 it('only stores the hash and scopes new links to the tenant origin',async()=>{mocks.execute.mockImplementation(async sql=>sql.startsWith('SELECT *')?[[{id:7}]]:[[]]);const result=await issueSubscription({userId:501,agencyId:1},1);expect(result.url).toMatch(/^https:\/\/app.itsco.health\/api\/calendar-sharing\/feed\/[\w-]{43}\.ics$/);const update=mocks.execute.mock.calls.find(([sql])=>sql.includes('SET token_hash=?'));expect(update[1][0]).toMatch(/^[a-f0-9]{64}$/);expect(result.url).not.toContain(update[1][0]);});
 it('revokes an existing link without deleting app events',async()=>{mocks.execute.mockResolvedValue([[{id:7}]]);await revokeSubscription({userId:501,agencyId:1},1);expect(mocks.execute).toHaveBeenCalledWith('UPDATE calendar_publications SET token_hash=NULL WHERE id=?',[7]);});
 it('does not reveal feed hashes or owner credentials in settings',async()=>{mocks.execute.mockImplementation(async sql=>sql.startsWith('SELECT *')?[[{id:7,token_hash:'secret',google_subject:'automation@example.com'}]]:[[]]);const status=await publicationStatus({userId:501,agencyId:1},1);expect(JSON.stringify(status)).not.toMatch(/secret|automation/);});
 it('requires active agency membership independent of SSO',async()=>{mocks.execute.mockResolvedValue([[]]);await expect(assertWorkCalendar(1,2)).rejects.toMatchObject({status:403});expect(mocks.execute.mock.calls[0][0]).toContain('ua.is_active=1');});
});
