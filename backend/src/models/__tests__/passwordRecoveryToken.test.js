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
