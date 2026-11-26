import { beforeEach, expect, it, vi } from 'vitest';
import { denverFingerprintingDefaultInstructions } from '../../../../frontend/src/navigation/hireDocuments.js';

const db = vi.hoisted(() => ({ execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: async () => db } }));
import { fingerprintingDefaultInstructions, saveFingerprintingDefaultInstructions } from '../hireFingerprintingGuide.service.js';

const request = { agencyId: 2, previousInstructions: denverFingerprintingDefaultInstructions, instructions: '  Notify Rachel once complete.  ' };

beforeEach(() => {
  vi.clearAllMocks();
  db.execute.mockImplementation(async sql => sql.startsWith('SELECT') ? [[{ prehire_settings: { invite_email_subject: 'Welcome' } }]] : [{ affectedRows: 1 }]);
});

it('seeds the screenshot text for future hires and saves edits with a targeted ITSCO settings update', async () => {
  expect(fingerprintingDefaultInstructions({})).toBe(denverFingerprintingDefaultInstructions);
  expect(fingerprintingDefaultInstructions({ denver_fingerprinting_instructions: '' })).toBe('');
  expect(await saveFingerprintingDefaultInstructions(request)).toEqual({ instructions: 'Notify Rachel once complete.' });
  expect(db.execute.mock.calls[0][0]).toMatch(/slug = 'itsco'[\s\S]*FOR UPDATE/);
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('JSON_SET('), ['Notify Rachel once complete.', 2]);
  expect(db.commit).toHaveBeenCalledOnce();
});

it('preserves a newer edit when a second editor tries to save an earlier version', async () => {
  db.execute.mockResolvedValueOnce([[{ prehire_settings: { denver_fingerprinting_instructions: 'Newer version' } }]]);
  await expect(saveFingerprintingDefaultInstructions(request)).rejects.toMatchObject({ status: 409 });
  expect(db.execute).toHaveBeenCalledTimes(1);
  expect(db.rollback).toHaveBeenCalledOnce();
});

it('refuses a different organization and overlong input', async () => {
  db.execute.mockResolvedValueOnce([[]]);
  await expect(saveFingerprintingDefaultInstructions(request)).rejects.toMatchObject({ status: 404 });
  await expect(saveFingerprintingDefaultInstructions({ ...request, instructions: 'a'.repeat(4001) })).rejects.toMatchObject({ status: 400 });
  expect(db.execute).toHaveBeenCalledTimes(1);
  expect(db.commit).not.toHaveBeenCalled();
});
