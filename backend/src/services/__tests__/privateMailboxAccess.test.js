import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn(async () => [{ id: 2 }]) } }));
import pool from '../../config/database.js';
import CommunicationInbox from '../../models/CommunicationInbox.model.js';
import { requireConversationAccess } from '../communicationAccess.service.js';
import { individualMailboxSql, privateMailboxVisibilitySql } from '../privateMailboxPolicy.js';
beforeEach(() => vi.clearAllMocks());
it('individual group mail is owner-only even for application administrators and prior inbox members', async () => {
  pool.execute.mockResolvedValue([[{ id: 60, agency_id: 2, inbox_kind: 'personal', inbox_owner_user_id: 8 }]]);
  for (const role of ['staff','admin','support','super_admin']) {
    await expect(requireConversationAccess({ id: 9, role }, 60)).rejects.toMatchObject({ status: 404 });
  }
  await expect(requireConversationAccess({ id: 8, role: 'staff' }, 60)).resolves.toMatchObject({ id: 60 });
  expect(pool.execute.mock.calls[0][0]).toContain('poa.agency_id=i.agency_id');
});
it('inbox discovery keeps legacy individual mail private while preserving communal and mailbox-less channels', async () => {
  pool.execute.mockResolvedValue([[]]);
  await CommunicationInbox.listForAgency({ agencyId: 2, userId: 9 });
  const sql = pool.execute.mock.calls[0][0];
  expect(sql).toContain("'schools','schoolreply'");
  expect(sql).toContain('LOWER(po.work_email)');
  expect(sql).toContain('HAVING COUNT(DISTINCT po.id)=1');
  expect(sql).toContain('AS owner_user_id');
  expect(individualMailboxSql()).toContain("COALESCE(i.kind,'')='personal'");
  expect(privateMailboxVisibilitySql('9 OR 1=1')).not.toContain('9 OR');
  expect(() => individualMailboxSql('i; DROP')).toThrow('Invalid mailbox alias');
});
