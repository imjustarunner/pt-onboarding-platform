import { expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ execute: vi.fn().mockResolvedValue([[]]) }));
vi.mock('../../config/database.js', () => ({ default: db }));
import ClientGuardianIntakeProfile from '../ClientGuardianIntakeProfile.model.js';
it('encrypts guardian contact details without changing the child’s birth date', async () => {
  vi.stubEnv('GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 1).toString('base64'));
  try {
    await ClientGuardianIntakeProfile.upsertForClient({ clientId: 22, profile: { firstName: 'Pat', dateOfBirth: '1980-01-02' }, source: 'staff_contact_update' });
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.execute.mock.calls[0][0]).toContain('INSERT INTO client_guardian_intake_profiles');
    expect(db.execute.mock.calls[0][1][1]).not.toContain('Pat');
    expect(db.execute.mock.calls[0][1][1]).not.toContain('1980-01-02');
    expect(db.execute.mock.calls.some(([sql]) => /UPDATE clients/i.test(sql))).toBe(false);
  } finally { vi.unstubAllEnvs(); }
});
