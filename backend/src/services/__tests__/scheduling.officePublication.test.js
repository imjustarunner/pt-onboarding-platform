import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn()}}));
vi.mock('../../models/ProviderVirtualSlotAvailability.model.js',()=>({default:{upsertSlot:vi.fn()}}));
vi.mock('../../models/ProviderInPersonSlotAvailability.model.js',()=>({default:{upsertSlot:vi.fn()}}));
import pool from '../../config/database.js';
import IP from '../../models/ProviderInPersonSlotAvailability.model.js';
import {officePublicationMatches,publishOfficeAvailability} from '../publishOfficeAvailability.service.js';
const first={id:1,room_id:5,office_location_id:2,start_at:'2026-10-08 13:00:00',end_at:'2026-10-08 14:00:00'};
describe('office-linked publication cadence',()=>{
 it('monthly means the same ordinal weekday, not every four weeks',()=>{
  expect(officePublicationMatches({start_at:'2026-11-12 14:00:00',end_at:'2026-11-12 15:00:00'},first,'MONTHLY','America/Denver')).toBe(true);
  expect(officePublicationMatches({start_at:'2026-11-05 14:00:00',end_at:'2026-11-05 15:00:00'},first,'MONTHLY','America/Denver')).toBe(false);
 });
 it('matches actual reservations every four weeks across DST',()=>{
  expect(officePublicationMatches({start_at:'2026-11-05 14:00:00',end_at:'2026-11-05 15:00:00'},first,'EVERY_4_WEEKS','America/Denver')).toBe(true);
  expect(officePublicationMatches({start_at:'2026-10-15 13:00:00',end_at:'2026-10-15 14:00:00'},first,'EVERY_4_WEEKS','America/Denver')).toBe(false);
 });
 it('publishes unbound reservations atomically and skips actual appointments',async()=>{
  IP.upsertSlot.mockReset();const conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>[sql.includes('FROM office_locations')?[{timezone:'America/Denver'}]:[first,{...first,id:2,start_at:'2026-11-05 14:00:00',end_at:'2026-11-05 15:00:00',has_appointment:1}]])};pool.getConnection.mockResolvedValue(conn);
  const out=await publishOfficeAvailability({event:first,agencyId:2,providerId:9,frequency:'EVERY_4_WEEKS',format:'IN_PERSON',actorId:7});
  expect(out).toMatchObject({publishedCount:1,skippedAppointments:1,purpose:'ONGOING'});expect(IP.upsertSlot).toHaveBeenCalledWith(expect.objectContaining({database:conn,agencyId:2,providerId:9,frequency:'EVERY_4_WEEKS'}));expect(conn.commit).toHaveBeenCalled();
 });
});
