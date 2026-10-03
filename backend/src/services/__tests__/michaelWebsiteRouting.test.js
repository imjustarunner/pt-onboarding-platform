import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js', () => ({default: {execute: vi.fn()}}));
import {routePublicWebsiteTicket} from '../publicWebsiteTicketRouting.service.js';
describe('Michael consulting inquiry ownership', () => {
 it('requires an active tenant owner membership and preserves existing claims', async () => {
  const db={execute:vi.fn().mockResolvedValueOnce([[{id:501}]]).mockResolvedValue([{}])};
  await routePublicWebsiteTicket({agency:{id:442,slug:'michael'},ticketId:123,category:'other'},db);
  expect(db.execute.mock.calls[0][0]).toContain('ua.agency_id=a.id');
  expect(db.execute.mock.calls[0][0]).toContain('a.account_owner_user_id');
  expect(db.execute.mock.calls[1][0]).toContain('COALESCE(claimed_by_user_id,?)');
  expect(db.execute.mock.calls[1][1]).toEqual([501,123,442]);
 });
 it('does not claim an inquiry if no unambiguous active owner exists',async()=>{
  for(const owners of [[],[{id:1},{id:2}]]){
   const db={execute:vi.fn().mockResolvedValue([owners])};
   await routePublicWebsiteTicket({agency:{id:442,slug:'michael'},ticketId:123},db);
   expect(db.execute).toHaveBeenCalledTimes(1);
  }
 });
 it('leaves unrelated tenants alone',async()=>{
  const db={execute:vi.fn()};
  await routePublicWebsiteTicket({agency:{id:7,slug:'someone-else'},ticketId:123},db);
  expect(db.execute).not.toHaveBeenCalled();
 });
});
