import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), encryption: true }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../chatEncryption.service.js', () => ({ isChatEncryptionConfigured: () => m.encryption }));
import { TRANSITION_REQUIRED_COLUMNS, requireTransitionWeekReadiness } from '../transitionWeekReadiness.service.js';
const columns = () => Object.entries(TRANSITION_REQUIRED_COLUMNS).flatMap(([TABLE_NAME, fields]) => fields.map(COLUMN_NAME => ({ TABLE_NAME, COLUMN_NAME })));
beforeEach(() => { vi.clearAllMocks(); m.encryption = true; m.execute.mockImplementation(async sql => sql.includes('information_schema') ? [columns()] : [[{ success: 1 }]]); });
it('accepts the complete additive schema and the logged successful migration', async () => {
  expect(await requireTransitionWeekReadiness()).toEqual({ ready: true, tables: 4, migration: '1830_practice_transition_week' });
  expect(m.execute.mock.calls[1][1]).toEqual(['1830_practice_transition_week']);
});
it('blocks a partially applied migration before the candidate can pass readiness', async () => {
  m.execute.mockResolvedValue([columns().filter(row => row.COLUMN_NAME !== 'payload_json')]);
  await expect(requireTransitionWeekReadiness()).rejects.toThrow('migration 1830 is incomplete');
});
it('blocks absent/failed migration proof even if matching tables exist', async () => {
  m.execute.mockImplementation(async sql => sql.includes('information_schema') ? [columns()] : [[{ success: 0 }]]);
  await expect(requireTransitionWeekReadiness()).rejects.toThrow('recorded successful');
});
it('preserves the encryption prerequisite and never writes records or changes keys', async () => {
  m.encryption = false; await expect(requireTransitionWeekReadiness()).rejects.toThrow('encryption');
  expect(m.execute).not.toHaveBeenCalled();
});
