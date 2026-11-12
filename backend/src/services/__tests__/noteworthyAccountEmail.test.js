import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { createNoteworthyAccountEmail } from '../noteworthyAccountEmail.service.js';
import { isRequestedAccountEmail } from '../../utils/accountAccessEmail.js';

let sqlite, db, service, transport, verifySender;
const input = () => ({ to: 'requested-owner@example.test', subject: 'Verify your account', text: 'Requested account verification', templateType: 'noteworthy_email_verification' });
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE agencies(id INTEGER,slug TEXT,organization_type TEXT,is_active INTEGER,is_archived INTEGER);
    CREATE TABLE email_sender_identities(id INTEGER,agency_id INTEGER,identity_key TEXT,from_email TEXT,is_active INTEGER);
    INSERT INTO agencies VALUES(111,'plottwistco','agency',1,0),(222,'unrelated','agency',1,0);
    INSERT INTO email_sender_identities VALUES(333,111,'notifications','Notifications@plottwistco.com',1),
      (51,222,'notifications','notifications@other.example',1),(52,NULL,'system','global@example.test',1);`);
  db = { execute: async (sql, args) => [sqlite.prepare(sql).all(...args)] };
  transport = vi.fn(async () => ({ id: 'gmail-accepted' }));
  verifySender = vi.fn(async () => {});
  service = createNoteworthyAccountEmail({ db, transport, verifySender, configuredIdentityId: () => undefined });
});
afterEach(() => sqlite.close());

it('uses the active platform Notifications identity by scope rather than a hardcoded ID or tenant/global fallback', async () => {
  expect(await service.resolveSender()).toMatchObject({ id: 333, agency_id: 111 });
  expect(await service.send(input())).toEqual({ sent: true, pending: false });
  expect(verifySender).toHaveBeenCalledWith('Notifications@plottwistco.com');
  expect(transport).toHaveBeenCalledWith(expect.objectContaining({ senderIdentityId: 333, templateType: 'noteworthy_email_verification', source: 'manual' }));
});

it.each(['inactive identity', 'inactive platform', 'archived platform', 'wrong domain', 'missing platform'])('rejects %s without selecting another sender', async state => {
  if (state === 'inactive identity') sqlite.exec('UPDATE email_sender_identities SET is_active=0 WHERE id=333');
  if (state === 'inactive platform') sqlite.exec('UPDATE agencies SET is_active=0 WHERE id=111');
  if (state === 'archived platform') sqlite.exec('UPDATE agencies SET is_archived=1 WHERE id=111');
  if (state === 'wrong domain') sqlite.exec("UPDATE email_sender_identities SET from_email='spoof@other.example' WHERE id=333");
  if (state === 'missing platform') sqlite.exec("UPDATE agencies SET slug='other' WHERE id=111");
  await expect(service.send(input())).rejects.toMatchObject({ code: 'VERIFICATION_EMAIL_UNAVAILABLE' });
  expect(transport).not.toHaveBeenCalled();
});

it('optional identity configuration can only narrow the authorized platform scope', async () => {
  service = createNoteworthyAccountEmail({ db, transport, verifySender, configuredIdentityId: () => '51' });
  await expect(service.resolveSender()).rejects.toMatchObject({ code: 'VERIFICATION_EMAIL_UNAVAILABLE' });
  service = createNoteworthyAccountEmail({ db, transport, verifySender, configuredIdentityId: () => '333' });
  expect(await service.resolveSender()).toHaveProperty('id', 333);
});

it('rejects an unverified Gmail sender before attempting delivery', async () => {
  verifySender.mockRejectedValueOnce(Object.assign(new Error('Unverified'), { code: 'EMAIL_SENDER_UNVERIFIED' }));
  await expect(service.send(input())).rejects.toHaveProperty('code', 'EMAIL_SENDER_UNVERIFIED');
  expect(transport).not.toHaveBeenCalled();
});

it.each([{ id: 'gmail', redirected: true }, { id: 'gmail', testInboxRedirect: { deliveredTo: ['test@example.test'] } },
  { blocked: true }, { skipped: true }, { messageId: '<not-a-provider-receipt@example.test>' }, { sent: true }])('does not claim delivery for a redirected, blocked, or unconfirmed result %j', async result => {
  transport.mockResolvedValueOnce(result);
  expect(await service.send(input())).toEqual({ sent: false, pending: false });
});

it('does not confuse a persisted communication or transport error with a sent receipt', async () => {
  transport.mockResolvedValueOnce({ communicationId: 123, delivery_status: 'failed' });
  expect(await service.send(input())).toEqual({ sent: false, pending: false });
  transport.mockRejectedValueOnce(Object.assign(new Error('Provider failed'), { communicationId: 124 }));
  await expect(service.send(input())).rejects.toThrow('Provider failed');
});

it('keeps queued delivery distinct from sent and only accepts requested account-email templates', async () => {
  transport.mockResolvedValueOnce({ id: 'not-sent', queued: true });
  expect(await service.send(input())).toEqual({ sent: false, pending: true });
  await expect(service.send({ ...input(), templateType: 'marketing_broadcast' })).rejects.toHaveProperty('code', 'VERIFICATION_EMAIL_UNAVAILABLE');
  expect(isRequestedAccountEmail('noteworthy_email_verification')).toBe(true);
  expect(isRequestedAccountEmail('noteworthy_employee_invitation')).toBe(true);
});
