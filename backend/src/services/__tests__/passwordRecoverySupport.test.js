import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), notify: vi.fn(), encrypt: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/Notification.model.js', () => ({ default: { create: m.notify } }));
vi.mock('../../utils/supportTicketCrypto.js', () => ({ prepareEncryptedTicketText: m.encrypt }));
import { createPasswordRecoverySupportTicket } from '../passwordRecoverySupport.service.js';
const args = { user: { id: 42, email: 'work@example.test', personal_email: 'personal@example.test', status: 'INACTIVE_EMPLOYEE' }, agency: { id: 9 }, requestedEmail: 'personal@example.test', replyEmail: 'personal@example.test' };
beforeEach(() => {
  vi.resetAllMocks();
  m.encrypt.mockReturnValue({ plain: null, ciphertext: 'encrypted', iv: 'iv', authTag: 'tag', keyId: 'key' });
  m.execute.mockResolvedValueOnce([{ insertId: 81 }]).mockResolvedValueOnce([[{ id: 3 }, { id: 4 }]]);
  m.notify.mockResolvedValue({ id: 1 });
});
describe('password recovery support tickets', () => {
  it('saves an open tenant ticket with encrypted review details and notifies staff', async () => {
    expect(await createPasswordRecoverySupportTicket(args)).toBe(81);
    const [sql, params] = m.execute.mock.calls[0];
    expect(sql).toContain("'open', 'tenant', 'general', 'public_web'");
    expect(params).toEqual([9, 9, 'password_recovery', expect.any(String), null, 'personal@example.test', 'encrypted', 'iv', 'tag', 'key']);
    expect(m.encrypt.mock.calls[0][0]).toContain('Account ID: 42');
    expect(m.encrypt.mock.calls[0][0]).toContain('personal@example.test');
    expect(m.encrypt.mock.calls[0][0]).toContain('INACTIVE_EMPLOYEE');
    expect(m.encrypt.mock.calls[0][0]).toContain('identity has not been verified');
    expect(m.notify).toHaveBeenCalledTimes(2);
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 3, agencyId: 9, relatedEntityId: 81, relatedEntityType: 'support_ticket', actorUserId: null }));
  });
  it('propagates ticket storage failure without notifying staff', async () => {
    m.execute.mockReset().mockRejectedValue(new Error('storage unavailable'));
    await expect(createPasswordRecoverySupportTicket(args)).rejects.toThrow('storage unavailable');
    expect(m.notify).not.toHaveBeenCalled();
  });
  it('keeps a saved ticket successful if a notification fails and continues other recipients', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    m.notify.mockRejectedValueOnce(new Error('notification unavailable'));
    expect(await createPasswordRecoverySupportTicket(args)).toBe(81);
    expect(m.notify).toHaveBeenCalledTimes(2);
  });
});
