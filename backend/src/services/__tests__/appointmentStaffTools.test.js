import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/Appointment.model.js', () => ({ default: {} }));
vi.mock('../../models/User.model.js', () => ({ default: {} }));
vi.mock('../clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: vi.fn() }));
vi.mock('../clinicalNoteCrypto.service.js', () => ({ maybeEncryptNotePayload: vi.fn(), maybeDecryptNotePayload: vi.fn() }));
import { createAppointmentStaffTools } from '../appointmentStaffTools.service.js';

let db, conn, appointments, users, clientAccess, encrypt, decrypt, service;
const provider = { id: 9, role: 'provider' };
beforeEach(() => {
  conn = { beginTransaction: vi.fn(), execute: vi.fn(async sql => sql.includes('SELECT revision') ? [[{ revision: 2 }]] : [{ affectedRows: 1 }]), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  db = { execute: vi.fn(async () => [[{ alert_text: 'encrypted', revision: 2 }]]), getConnection: vi.fn(async () => conn) };
  appointments = { findById: vi.fn(async () => ({ id: 12, agencyId: 2, providerUserId: 9 })), listParticipants: vi.fn(async () => [{ clientId: 31 }, { clientId: 32 }, { clientId: 31 }]) };
  users = { getAgencies: vi.fn(async () => [{ id: 2 }]), findById: vi.fn(async () => ({})), isSupervisor: vi.fn(() => false), supervisorHasAccess: vi.fn(async () => false) };
  clientAccess = vi.fn(async ({ clientId }) => ({ ok: clientId === 31, client: { full_name: 'Authorized client' } }));
  encrypt = vi.fn(value => `encrypted:${value}`); decrypt = vi.fn(() => 'Bring paperwork');
  service = createAppointmentStaffTools({ db, appointments, users, clientAccess, encrypt, decrypt });
});

describe('private appointment staff tools', () => {
  it.each(['client', 'client_guardian', 'guardian', 'school_staff', 'family_member'])('blocks %s before reading private alert storage', async role => {
    await expect(service.get({ id: 9, role }, 12)).rejects.toMatchObject({ status: 403 });
    expect(db.execute).not.toHaveBeenCalled(); expect(decrypt).not.toHaveBeenCalled();
  });
  it.each(['agency_admin', 'backoffice_admin', 'scheduler', 'front_desk', 'staff'])('preserves %s appointment operations without broadening private alert visibility', async role => {
    expect(await service.authorize({ id: 80, role }, 12)).toMatchObject({ id: 12 });
    expect(db.execute).not.toHaveBeenCalled();
    await expect(service.get({ id: 80, role }, 12)).rejects.toMatchObject({ status: 403 });
    users.getAgencies.mockResolvedValue([{ id: 99 }]);
    await expect(service.authorize({ id: 80, role }, 12)).rejects.toMatchObject({ status: 403 });
  });
  it.each(['client', 'client_guardian', 'family_member', 'provider'])('rejects %s access to another provider appointment communications', async role => {
    await expect(service.authorize({ id: 80, role }, 12)).rejects.toMatchObject({ status: 403 });
  });
  it('does not let typed peer calendar visibility expose internal alerts', async () => {
    await expect(service.get({ id: 77, role: 'provider' }, 12)).rejects.toMatchObject({ status: 403 });
    expect(db.execute).not.toHaveBeenCalled();
  });
  it('requires agency membership even when the user is the appointment provider', async () => {
    users.getAgencies.mockResolvedValue([{ id: 99 }]);
    await expect(service.get(provider, 12)).rejects.toMatchObject({ status: 403 });
  });
  it('shares the decrypted alert with authorized schedule staff and filters client communications by record access', async () => {
    const result = await service.get(provider, 12);
    expect(result.alert).toMatchObject({ text: 'Bring paperwork', revision: 2 });
    expect(result.clients).toEqual([{ id: 31, name: 'Authorized client' }]);
    expect(clientAccess).toHaveBeenCalledTimes(2);
  });
  it('allows an assigned supervisor but not a supervisor of a different provider', async () => {
    users.isSupervisor.mockReturnValue(true); users.supervisorHasAccess.mockResolvedValue(true);
    expect((await service.get({ id: 80, role: 'supervisor' }, 12)).alert.text).toBe('Bring paperwork');
    expect(users.supervisorHasAccess).toHaveBeenCalledWith(80, 9, 2);
  });
  it('writes encrypted content and encrypted audit history without changing any client-facing appointment fields', async () => {
    expect(await service.save(provider, 12, { text: ' Bring paperwork ', revision: 2 })).toEqual({ text: 'Bring paperwork', revision: 3 });
    const writes = conn.execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT'));
    expect(writes).toHaveLength(2);
    expect(writes[0][1]).toEqual([12, 'encrypted:Bring paperwork', 3, 9]);
    expect(writes[1][1]).toEqual([12, 3, 'encrypted:Bring paperwork', 9]);
    expect(conn.commit).toHaveBeenCalledOnce(); expect(conn.release).toHaveBeenCalledOnce();
  });
  it('rejects stale edits and leaves existing content unchanged', async () => {
    await expect(service.save(provider, 12, { text: 'Replacement', revision: 1 })).rejects.toMatchObject({ status: 409 });
    expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
    expect(conn.rollback).toHaveBeenCalledOnce();
  });
  it('removes the current alert while retaining a revision in its history', async () => {
    await service.save(provider, 12, { text: '', revision: 2 });
    expect(encrypt).not.toHaveBeenCalled();
    expect(conn.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO appointment_staff_alert_events'))[1]).toEqual([12, 3, null, 9]);
  });
  it('bounds alert length and refuses missing revisions', async () => {
    await expect(service.save(provider, 12, { text: 'x'.repeat(501), revision: 2 })).rejects.toMatchObject({ status: 400 });
    await expect(service.save(provider, 12, { text: 'test' })).rejects.toMatchObject({ status: 400 });
    expect(db.getConnection).not.toHaveBeenCalled();
  });
  it('limits batch results to the authorized provider, agency and selected window', async () => {
    db.execute.mockResolvedValue([[{ appointment_id: 12, provider_schedule_event_id: 23, office_event_id: null, alert_text: 'encrypted', revision: 2 }]]);
    const alerts = await service.list(provider, { providerId: 9, agencyId: 2, windowStart: '2026-10-14T06:00:00Z', windowEnd: '2026-10-21T06:00:00Z' });
    expect(alerts[0]).toMatchObject({ appointmentId: 12, providerScheduleEventId: 23, officeEventId: null, text: 'Bring paperwork' });
    expect(db.execute.mock.calls[0][1]).toEqual([2, 9, '2026-10-21 06:00:00', '2026-10-14 06:00:00']);
    await expect(service.list(provider, { providerId: 9, agencyId: 2, windowStart: '2020-01-01', windowEnd: '2027-01-01' })).rejects.toMatchObject({ status: 400 });
  });
});
