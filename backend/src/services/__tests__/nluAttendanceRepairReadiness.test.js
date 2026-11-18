import { expect, it, vi } from 'vitest';
import { requireNluAttendanceRepairSchema } from '../nluAttendanceRepairReadiness.service.js';

it('checks new storage and declaration versions without reading any application content', async () => {
  const db = { execute: vi.fn(async sql => [sql.startsWith('SHOW') ? [{ Key_name: 'idx_no_show_appointment_version' }] : []]) };
  await expect(requireNluAttendanceRepairSchema(db)).resolves.toBeUndefined();
  expect(db.execute.mock.calls.filter(([sql]) => sql.startsWith('SELECT')).every(([sql]) => sql.endsWith('LIMIT 0'))).toBe(true);
});

it('keeps a candidate unready if the old one-declaration constraint or missing publication storage remains', async () => {
  const oldSchema = { execute: async sql => [sql.startsWith('SHOW') ? [{ Key_name: 'uq_no_show_appointment' }] : []] };
  await expect(requireNluAttendanceRepairSchema(oldSchema)).rejects.toMatchObject({ requiredMigrations: ['1847', '1848'] });
  const missing = { execute: async () => { throw Object.assign(new Error('Missing table'), { code: 'ER_NO_SUCH_TABLE' }); } };
  await expect(requireNluAttendanceRepairSchema(missing)).rejects.toMatchObject({ code: 'ER_NO_SUCH_TABLE' });
});
