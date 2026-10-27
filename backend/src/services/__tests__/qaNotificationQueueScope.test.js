import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),query:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,query:m.query},onTableWrite:vi.fn()}));
import {processDueSessionNotifications} from '../sessionNotification.service.js';
beforeEach(()=>{vi.resetAllMocks();m.execute.mockResolvedValue([[]]);m.query.mockResolvedValue([[]]);});
it('carries the demo agency through every nested notification queue query',async()=>{
 const result=await processDueSessionNotifications({agencyId:450});
 expect(result).toMatchObject({processed:0,failed:0,scheduleUpdates:{failed:0},replacementBookings:{failed:0},replacementOutcomes:{failed:0}});
 const calls=[...m.query.mock.calls,...m.execute.mock.calls];
 for(const table of ['appointment_reminders','appointment_change_notification_queue','appointment_cancellation_deliveries','appointment_schedule_notices','appointment_replacement_offers','appointment_replacement_events']) {
  const reads=calls.filter(([sql])=>sql.includes('FROM '+table));expect(reads.length,table).toBeGreaterThan(0);
  for(const[sql,args]of reads){expect(sql,table).toMatch(/\? IS NULL OR (?:r\.|o\.)?agency_id\s*=\s*\?|\? IS NULL OR offer_id IN/);expect(args.slice(0,2),table).toEqual([450,450]);}
 }
});
it.each([0,-1,'450',NaN])('refuses invalid scopes before any queue read: %j',async agencyId=>{
 await expect(processDueSessionNotifications({agencyId})).rejects.toThrow('valid notification agency');expect(m.query).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();
});
it('retains the existing global behavior for explicit legacy callers',async()=>{
 await processDueSessionNotifications();expect(m.query.mock.calls[0][1].slice(0,2)).toEqual([null,null]);
});
