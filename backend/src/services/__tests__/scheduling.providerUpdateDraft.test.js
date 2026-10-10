import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/database.js', () => ({ onTableWrite: () => {}, default: { execute: vi.fn(), query: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import { assertAgencyAdmin, getRecipientByToken, getMyOpenRecipient, updatePush } from '../providerUpdate.service.js';
beforeEach(() => { vi.clearAllMocks(); pool.execute.mockResolvedValue([[]]); User.getAgencies.mockResolvedValue([{ id: 2 }]); });
it('requires an administrator in the selected agency, not merely membership', async () => {
 await expect(assertAgencyAdmin({ id: 9, role: 'provider' }, 2)).rejects.toMatchObject({ status: 403 });
 await expect(assertAgencyAdmin({ id: 9, role: 'admin' }, 3)).rejects.toMatchObject({ status: 403 });
 await expect(assertAgencyAdmin({ id: 9, role: 'admin' }, 2)).resolves.toBe(2);
});
it('keeps draft recipient links inaccessible and excludes drafts from the employee dashboard', async () => {
 pool.execute.mockResolvedValue([[{ id: 1, push_status: 'draft' }]]);
 expect(await getRecipientByToken('synthetic-draft-token')).toBeNull();
 await getMyOpenRecipient(9, 2);
 expect(pool.execute.mock.calls[1][0]).toContain("p.status = 'sent'");
});
it('permits only a valid preview token to read a draft and revokes closed previews',async()=>{const token='preview_'+'a'.repeat(48);pool.execute.mockResolvedValue([[{id:1,token,push_status:'draft',expires_at:'2099-01-01'}]]);expect((await getRecipientByToken(token)).previewOnly).toBe(true);pool.execute.mockResolvedValue([[{id:1,token,push_status:'closed'}]]);expect(await getRecipientByToken(token)).toBeNull();});
it('cannot release a draft through the ordinary save endpoint', async () => {
 pool.execute.mockResolvedValue([[{ id: 1, agency_id: 2, status: 'draft' }]]);
 await expect(updatePush({ pushId: 1, agencyId: 2, status: 'sent' })).rejects.toThrow('Use Send');
 expect(pool.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});

it('permits an explicitly requested completion receipt but keeps every default token operation locked',async()=>{pool.execute.mockResolvedValue([[{id:1,token:'done',push_status:'sent',status:'finalized',finalized_at:'2026-10-10',locked_at:'2026-10-10',expires_at:'2099-01-01'}]]);await expect(getRecipientByToken('done')).rejects.toMatchObject({status:410});expect((await getRecipientByToken('done',{allowCompletedReceipt:true})).status).toBe('finalized');});
it('never treats an administrative lock, expiration, or closed campaign as completed access',async()=>{const base={id:1,token:'locked',push_status:'sent',status:'in_progress',locked_at:'2026-10-10'};pool.execute.mockResolvedValue([[base]]);await expect(getRecipientByToken('locked',{allowCompletedReceipt:true})).rejects.toMatchObject({status:410});pool.execute.mockResolvedValue([[{...base,status:'finalized',finalized_at:'2026-10-10',expires_at:'2000-01-01'}]]);await expect(getRecipientByToken('locked',{allowCompletedReceipt:true})).rejects.toMatchObject({status:410});pool.execute.mockResolvedValue([[{...base,push_status:'closed'}]]);expect(await getRecipientByToken('locked',{allowCompletedReceipt:true})).toBeNull();});
