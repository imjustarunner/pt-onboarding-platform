import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: db, onTableWrite: vi.fn() }));
import UserInfoValue from '../UserInfoValue.model.js';
beforeEach(() => vi.clearAllMocks());
describe('one saved employee birthdate', () => {
  it('clears all legacy birthdate values when saving or clearing the chosen definition', async () => {
    db.execute.mockResolvedValue([{ affectedRows: 2 }]);
    await UserInfoValue._dedupeByFieldKeyKeepDefinition({ userId: 12, fieldKey: 'date_of_birth', keepFieldDefinitionId: 10 });
    expect(db.execute.mock.calls[0][1]).toEqual([12, 'date_of_birth', 'provider_birthdate', 'birthdate', 10]);
    expect(db.execute.mock.calls[0][0]).toContain('uiv.field_definition_id <> ?');
  });
  it('deletes aliases even when the displayed canonical definition has no saved row', async () => {
    db.execute.mockResolvedValueOnce([[{ field_key: 'date_of_birth' }]]).mockResolvedValueOnce([{ affectedRows: 2 }]);
    expect(await UserInfoValue.delete(12, 10)).toBe(true);
    expect(db.execute.mock.calls[1][1]).toEqual([12, 'date_of_birth', 'provider_birthdate', 'birthdate']);
  });
  it('keeps unrelated field deletion scoped to its definition', async () => {
    db.execute.mockResolvedValueOnce([[{ field_key: 'personal_email' }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    await UserInfoValue.delete(12, 20);
    expect(db.execute.mock.calls[1][1]).toEqual([12, 20]);
  });
});
