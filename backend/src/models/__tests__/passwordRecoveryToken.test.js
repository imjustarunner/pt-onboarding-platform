import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: db, onTableWrite: vi.fn() }));
import User from '../User.model.js';
beforeEach(() => vi.clearAllMocks());
describe('requesting a recovery token leaves current credentials alone', () => {
  it('updates only recovery token fields, including when a permanent password already exists', async () => {
    db.execute.mockResolvedValue([{ affectedRows: 1 }]);
    const token = await User.generatePasswordlessToken(42, 48, 'reset');
    expect(token.token).toMatch(/^[a-f0-9]{64}$/);
    expect(db.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = db.execute.mock.calls[0];
    const updatedFields = sql.split('SET ')[1].split(' WHERE')[0].split(',').map((s) => s.trim().split(' = ')[0]);
    expect(updatedFields).toEqual(['passwordless_token', 'passwordless_token_expires_at', 'passwordless_token_purpose']);
    expect(params[2]).toBe('reset'); expect(params[3]).toBe(42);
  });
});

import UserActivityLog from '../UserActivityLog.model.js';
describe('recovery history tenant boundaries', () => {
  it('scopes historical events through their communication tenant and uses the same filter for counts', async () => {
    db.execute.mockResolvedValue([[]]);
    const filters = { agencyId: 9, actionTypes: ['password_reset_link_sent', 'password_reset_email_failed'], userId: 42 };
    await UserActivityLog.getAgencyActivityLog(filters);
    await UserActivityLog.countAgencyActivityLog(filters);
    const [listSql, listParams] = db.execute.mock.calls[0];
    const [countSql, countParams] = db.execute.mock.calls[1];
    expect(listSql).toContain('ual.agency_id IS NULL');
    expect(listSql).toContain('recovery_comm.agency_id = ?');
    expect(listSql).toContain("'$.communicationId'");
    expect(countSql).toContain('recovery_comm.agency_id = ?');
    expect(listParams).toEqual([9, 9, 42, 'password_reset_link_sent', 'password_reset_email_failed']);
    expect(countParams).toEqual(listParams);
  });
});
