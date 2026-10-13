import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { getConnection: vi.fn() } }));
import pool from '../../config/database.js';
import { registerPublicEventGuest, validatePublicEventRegistration } from '../companyEventPublicRegistration.service.js';

const event = { id: 12, agency_id: 2, is_active: 1, operations_json: { publicRegistrationEnabled: true }, ends_at: '2099-01-01' };
const body = { firstName: 'Staff name', email: 'existing.staff@example.test', response: 'yes', guestCount: 1 };
let conn;
beforeEach(() => {
  vi.clearAllMocks();
  conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
    if (sql.startsWith('SELECT * FROM company_events')) return [[event]];
    if (sql.startsWith('SELECT id, management_token_hash')) return [[]];
    return [{ insertId: 44, affectedRows: 1 }];
  }) };
  pool.getConnection.mockResolvedValue(conn);
});
it('stores anonymous RSVP as a guest and never impersonates an existing account', async () => {
  const result = await registerPublicEventGuest({ eventId: 12, body });
  expect(result).toMatchObject({ ok: true, matched: false, guestRegistrationId: 44 });
  expect(result.managementToken).toMatch(/^[a-f0-9]{64}$/);
  const sql = conn.execute.mock.calls.map(([sql])=>sql).join('\n');
  expect(sql).not.toMatch(/FROM users|INTO company_event_responses|company_event_provider_assignments/);
  expect(conn.commit).toHaveBeenCalledOnce();
});
it('requires the original management token to change a prior anonymous registration', async () => {
  const original = conn.execute.getMockImplementation();
  conn.execute.mockImplementation(async sql => sql.startsWith('SELECT id, management_token_hash') ? [[{ id: 44, management_token_hash: 'a'.repeat(64) }]] : original(sql));
  await expect(registerPublicEventGuest({ eventId: 12, body })).rejects.toMatchObject({ status: 409 });
  expect(conn.rollback).toHaveBeenCalledOnce();
  expect(conn.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE company_event_guest_registrations'))).toBe(false);
});
it('does not enroll a phone by default and rejects inferred checkbox consent', () => {
  expect(validatePublicEventRegistration({ ...body, phone: '3035550101' })).toMatchObject({ phone: '+13035550101', smsConsent: false });
  expect(() => validatePublicEventRegistration({ ...body, smsConsent: 'true' })).toThrow('explicit');
  expect(() => validatePublicEventRegistration({ ...body, smsConsent: true })).toThrow('mobile');
});
it('rechecks registration publication under the transaction lock', async () => {
  conn.execute.mockResolvedValue([[{ ...event, operations_json: { publicRegistrationEnabled: false } }]]);
  await expect(registerPublicEventGuest({ eventId: 12, body })).rejects.toMatchObject({ status: 404 });
  expect(conn.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(conn.commit).not.toHaveBeenCalled();
});
it('rejects unreasonable attendee counts before a database mutation', async () => {
  await expect(registerPublicEventGuest({ eventId: 12, body: { ...body, guestCount: 1.5 } })).rejects.toThrow('Guest count');
  expect(pool.getConnection).not.toHaveBeenCalled();
});
