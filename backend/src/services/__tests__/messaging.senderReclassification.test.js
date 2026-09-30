import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../afterHoursEmailPolicy.service.js', () => ({ verifiedAppOnlyProvider: vi.fn() }));
vi.mock('../emailSettings.service.js', () => ({ getAgencyEmailSettings: vi.fn(async () => ({})) }));
vi.mock('../../models/UserCommunicationContact.model.js', () => ({ default: { isBlocked: vi.fn(async () => null), findByEmail: vi.fn(async () => null) } }));
import pool from '../../config/database.js';
import Contact from '../../models/UserCommunicationContact.model.js';
import { verifiedAppOnlyProvider } from '../afterHoursEmailPolicy.service.js';
import { reclassifyUnknownConversationsForAgency, runUnknownSenderReclassificationTick } from '../senderTrust.service.js';
const rows = [
 {id:10,agency_id:2,owner_user_id:5,inbox_owner_user_id:7,from_email:'person@example.org'},
 {id:11,agency_id:2,owner_user_id:5,inbox_owner_user_id:7,from_email:'person@example.org'},
 {id:12,agency_id:2,owner_user_id:8,inbox_owner_user_id:null,from_email:'person@example.org'}
];
beforeEach(() => {
 vi.clearAllMocks();
 Contact.isBlocked.mockResolvedValue(null);
 pool.execute.mockImplementation(async (sql) => {
   if (sql.includes('LEFT JOIN communication_inboxes')) return [rows];
   if (sql.includes('FROM users u')) return [[{id:20,role:'staff',first_name:'Known'}]];
   return [{affectedRows:1}];
 });
});
describe('background sender trust refresh', () => {
 it('uses each mailbox owner instead of the viewer, and reuses checks only within that owner', async () => {
   expect(await reclassifyUnknownConversationsForAgency({agencyId:2,ownerUserId:999})).toEqual({checked:3,updated:3});
   expect(Contact.isBlocked.mock.calls.map(([arg]) => arg.ownerUserId)).toEqual([7,8]);
   expect(verifiedAppOnlyProvider).not.toHaveBeenCalled();
   const updates=pool.execute.mock.calls.filter(([sql]) => sql.startsWith('UPDATE communication_conversations'));
   expect(updates).toHaveLength(3);
   for(const [sql] of updates){expect(sql).not.toMatch(/visible_after|released_at/);}
 });
 it('does not promote a sender who is still unknown', async () => {
   pool.execute.mockImplementation(async(sql) => sql.includes('LEFT JOIN communication_inboxes') ? [[rows[0]]] : [[]]);
   expect(await reclassifyUnknownConversationsForAgency({agencyId:2})).toEqual({checked:1,updated:0});
   expect(pool.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
 });
 it('does not overlap scheduler batches', async () => {
   let finish;
   pool.execute.mockImplementationOnce(() => new Promise(resolve => { finish=resolve; }));
   const first=runUnknownSenderReclassificationTick();
   expect(await runUnknownSenderReclassificationTick()).toEqual({checked:0,updated:0});
   expect(pool.execute).toHaveBeenCalledTimes(1);
   finish([[]]); await first;
 });
 it('rotates a bounded batch and releases its lock after a database failure', async () => {
   pool.execute.mockResolvedValueOnce([Array.from({length:50},(_,i)=>({...rows[0],id:i+1}))]);
   await runUnknownSenderReclassificationTick();
   pool.execute.mockRejectedValueOnce(new Error('temporary'));
   await expect(runUnknownSenderReclassificationTick()).rejects.toThrow('temporary');
   expect(pool.execute.mock.calls.at(-1)[1]).toEqual([50]);
   pool.execute.mockResolvedValueOnce([[]]);
   await runUnknownSenderReclassificationTick();
   pool.execute.mockResolvedValueOnce([[]]);
   await runUnknownSenderReclassificationTick();
   expect(pool.execute.mock.calls.at(-1)[1]).toEqual([0]);
 });
});
