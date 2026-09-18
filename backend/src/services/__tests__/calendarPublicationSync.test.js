import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),lock:vi.fn(),release:vi.fn(),events:vi.fn(),insert:vi.fn(),update:vi.fn(),remove:vi.fn(),aclDelete:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.lock,release:m.release})}}));
vi.mock('../familyAuth.service.js',()=>({requireHousehold:vi.fn(async()=>({id:1})),assertFamilyBenefit:vi.fn()}));
vi.mock('../calendarEvents.service.js',()=>({familyCalendarEvents:m.events,workCalendarEvents:m.events}));
vi.mock('../googleWorkspaceAuth.service.js',()=>({buildImpersonatedJwtClient:vi.fn()}));
vi.mock('googleapis',()=>({google:{calendar:()=>({events:{insert:m.insert,update:m.update,delete:m.remove},acl:{delete:m.aclDelete}})}}));
import {syncGooglePublication} from '../calendarPublication.service.js';
const p={id:1,household_id:1,user_id:501,agency_id:1,calendar_kind:'family',detail_mode:'limited',google_calendar_id:'family-calendar',google_subject:'automation@example.com'};
const current={key:'family:1:1',title:'Personal event',start:'2026-09-20T10:00Z',end:'2026-09-20T11:00Z'};
beforeEach(()=>{vi.clearAllMocks();m.insert.mockReset();m.lock.mockResolvedValue([[{acquired:1}]]);m.events.mockResolvedValue([current]);m.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM calendar_publications')?[[p]]:sql.includes('SELECT * FROM calendar_publication_readers')?[[]]:sql.includes('SELECT u.email')?[[]]:sql.includes('SELECT * FROM calendar_publication_events')?[[{event_key:'removed',google_event_id:'old',fingerprint:'old'}]]:[[]]);});
describe('Google calendar mirroring',()=>{
 it('uses stable event IDs, strips extra fields and removes cancelled/deleted events',async()=>{await syncGooglePublication({userId:501,agencyId:1},1);const args=m.insert.mock.calls[0][0];expect(args.calendarId).toBe('family-calendar');expect(args.requestBody.id).toMatch(/^[0-9a-f]{64}$/);expect(args.sendUpdates).toBe('none');expect(args.requestBody.visibility).toBe('default');expect(m.remove).toHaveBeenCalledWith({calendarId:'family-calendar',eventId:'old',sendUpdates:'none'});expect(m.release).toHaveBeenCalledOnce();});
 it('does not mark a failed Google write as synchronized',async()=>{m.insert.mockRejectedValue(Object.assign(new Error('quota'),{code:429}));await expect(syncGooglePublication({userId:501,agencyId:1},1)).rejects.toMatchObject({code:429});expect(m.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO calendar_publication_events'))).toBe(false);expect(m.execute.mock.calls.some(([sql])=>sql.includes('last_synced_at=NOW()'))).toBe(false);expect(m.release).toHaveBeenCalledOnce();});
 it('prevents two replicas from syncing the same calendar',async()=>{m.lock.mockResolvedValue([[{acquired:0}]]);await expect(syncGooglePublication({userId:501,agencyId:1},1)).rejects.toMatchObject({status:409});expect(m.insert).not.toHaveBeenCalled();});
 it('recovers a retried insert after Google accepted it but the process lost the response',async()=>{m.insert.mockRejectedValueOnce(Object.assign(new Error('exists'),{code:409}));await syncGooglePublication({userId:501,agencyId:1},1);expect(m.update).toHaveBeenCalledOnce();expect(m.update.mock.calls[0][0].eventId).toBe(m.insert.mock.calls[0][0].requestBody.id);});
});
