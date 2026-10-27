import { expect, it, vi } from 'vitest';
import { syncPersonalMailboxDisplayName } from '../personalMailboxDisplayName.service.js';
it('compares mailbox names using a single explicit collation when profile columns differ', async () => {
  const db = { execute: vi.fn().mockResolvedValue([{}]) };
  await syncPersonalMailboxDisplayName(db, 42);
  const [sql, params] = db.execute.mock.calls[0];
  expect(sql).toContain('CONVERT(i.display_name USING utf8mb4) COLLATE utf8mb4_unicode_ci <> CONVERT(CONCAT');
  expect(sql).toContain('CONVERT(e.display_name USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> CONVERT');
  expect(sql).not.toContain('i.display_name<>CONCAT'); expect(params).toEqual([42]);
});
