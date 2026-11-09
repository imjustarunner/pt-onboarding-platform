import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import { withStaffPollDisclosure, recordStaffSmsDisclosure } from '../staffSmsDisclosure.service.js';

const registration = { provider: 'vonage', purposes: ['workforce', 'polling'] };
const sender = { scope: 'campaign:staff-a', registration };
const phone = '+13035550101';
const body = 'ITSCO: Choose a date. Reply 125 1. Reply NOPOLLS to stop poll texts only.';
let db;
beforeEach(() => { db = { execute: vi.fn().mockResolvedValue([[]]) }; });

it.each([{ rows: [] }, { rows: [{ recent: 0 }] }])('adds a brief campaign reminder when no recent successful notice exists: %j', async ({ rows }) => {
  db.execute.mockResolvedValue([rows]);
  const result = await withStaffPollDisclosure({ sender, phone, body }, db);
  expect(result).toBe(`${body} Reply STOP to stop all staff texts; HELP for help.`);
  expect(result).not.toContain('rates');
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('INTERVAL 30 DAY'), [sender.scope, phone]);
  expect(db.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
it('does not repeat a campaign reminder already sent in the last 30 days', async () => {
  db.execute.mockResolvedValue([[{ recent: 1 }]]);
  expect(await withStaffPollDisclosure({ sender, phone, body }, db)).toBe(body);
});
it('keeps immediate vote replies short without moving the notice clock', async () => {
  expect(await withStaffPollDisclosure({ sender, phone, body, reply: true }, db)).toBe(body);
  expect(db.execute).not.toHaveBeenCalled();
});
it('preserves complete enrollment disclosures without appending a second notice', async () => {
  const welcome = 'ITSCO: Staff updates and surveys. Frequency varies. Message and data rates may apply. STOP to stop, HELP for help. START to restart.';
  expect(await withStaffPollDisclosure({ sender, phone, body: welcome }, db)).toBe(welcome);
  expect(db.execute).not.toHaveBeenCalled();
});
it.each([{ provider: 'notifyre', purposes: ['workforce'] }, { provider: 'vonage', purposes: ['care', 'polling'] }, {}])('does not change other campaign policies: %j', async other => {
  expect(await withStaffPollDisclosure({ sender: { ...sender, registration: other }, phone, body }, db)).toBe(body);
  expect(db.execute).not.toHaveBeenCalled();
});
it.each(['workforce', 'polling'])('records an accepted %s notice against the campaign and recipient', async purpose => {
  await recordStaffSmsDisclosure({ registration, noticeScope: sender.scope, to: phone, purpose, body: `${body} Reply STOP to stop all staff texts.` }, 'accepted-id', db);
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sms_program_opt_out_notices'), [sender.scope, phone, 'accepted-id']);
  expect(db.execute).toHaveBeenCalledOnce();
});
it.each([{ messageId: null }, { body }, { noticeScope: null }, { purpose: 'care' }])('does not advance the clock without a successful staff notice: %j', async patch => {
  const delivery = { registration, noticeScope: sender.scope, to: phone, purpose: 'polling', body: 'Reply STOP to stop all staff texts.', messageId: 'accepted-id', ...patch };
  await recordStaffSmsDisclosure(delivery, delivery.messageId, db);
  expect(db.execute).not.toHaveBeenCalled();
});
