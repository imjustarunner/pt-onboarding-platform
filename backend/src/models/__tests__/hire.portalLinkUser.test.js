import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: db, onTableWrite: vi.fn() }));
import User from '../User.model.js';

beforeEach(() => vi.clearAllMocks());
it('loads the token purpose used to recognize a renewed hiring portal link', async () => {
  db.execute.mockImplementation(async sql => {
    if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return [[{ COLUMN_NAME: 'passwordless_token_purpose' }]];
    const fields = sql.split(' FROM users')[0];
    return [[{ id: 7, passwordless_token: 'synthetic-token', passwordless_token_expires_at: '2099-01-01',
      ...(fields.includes('passwordless_token_purpose') ? { passwordless_token_purpose: 'prehire_portal' } : {}) }]];
  });
  expect(await User.findById(7, { raw: true })).toMatchObject({ passwordless_token_purpose: 'prehire_portal' });
});
it('retains compatibility with databases missing the optional purpose column', async () => {
  db.execute.mockImplementation(async sql => {
    if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return [[]];
    expect(sql.split(' FROM users')[0]).not.toContain('passwordless_token_purpose');
    return [[{ id: 7 }]];
  });
  expect(await User.findById(7, { raw: true })).toEqual({ id: 7 });
});
