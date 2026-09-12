import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../clinicalNoteCrypto.service.js', () => ({ maybeEncryptNotePayload: (v) => `encrypted:${v}` }));
import clinicalPool from '../../config/clinicalDatabase.js';
import { attachAppointmentChangeNotes, blockAppointmentChangeClaims } from '../appointmentChangeNote.service.js';
import ClinicalClaim from '../../models/clinical/ClinicalClaim.model.js';
const appointment = { id: 1, agencyId: 2, clinicalSessionId: 3, officeEventId: 4 };
let conn;
beforeEach(() => {
  vi.clearAllMocks();
  conn = { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  clinicalPool.getConnection.mockResolvedValue(conn); clinicalPool.execute.mockResolvedValue([[]]);
  conn.execute.mockImplementation(async (sql) => {
    if (sql.startsWith('SELECT id, client_id')) return [[{ id: 3, client_id: 5 }, { id: 6, client_id: 7 }]];
    if (sql.startsWith('SELECT id FROM clinical_notes')) return [[]];
    if (sql.includes('INSERT INTO clinical_notes')) return [{ insertId: 9 }];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
});
describe('appointment change session note', () => {
  const attach = () => attachAppointmentChangeNotes({ appointment, narrative: 'Client canceled.', eventType: 'canceled', actorUserId: 8, signedAt: '2026-09-12 15:00:00' });
  it('attaches encrypted, signed nonbillable documentation to all group sessions without claims', async () => {
    expect(await attach()).toHaveLength(2);
    const inserts = conn.execute.mock.calls.filter(([sql]) => sql.includes('INSERT'));
    expect(inserts).toHaveLength(2);
    for (const [sql, values] of inserts) {
      expect(sql).toContain('provider_signed_at'); expect(sql).toContain('is_billable');
      expect(sql).toContain("'APPOINTMENT_CHANGE'"); expect(sql).toContain('?, ?, ?, 0)');
      expect(values).toContain('encrypted:Client canceled.'); expect(values).toContain('2026-09-12 15:00:00');
      expect(sql).not.toContain('clinical_claims');
    }
    expect(conn.commit).toHaveBeenCalledOnce();
  });
  it('reuses the signed note after a partial failure', async () => {
    conn.execute.mockResolvedValueOnce([[{ id: 3, client_id: 5 }]]).mockResolvedValueOnce([[{ id: 77 }]]);
    expect(await attach()).toEqual([{ id: 77, clinicalSessionId: 3, clientId: 5 }]);
    expect(conn.execute.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
  });
  it('rolls back when a note cannot be saved', async () => {
    conn.execute.mockRejectedValueOnce(new Error('clinical storage unavailable'));
    await expect(attach()).rejects.toThrow('clinical storage unavailable');
    expect(conn.rollback).toHaveBeenCalledOnce(); expect(conn.commit).not.toHaveBeenCalled(); expect(conn.release).toHaveBeenCalledOnce();
  });
  it('blocks all appointment and legacy office sessions before completion', async () => {
    await blockAppointmentChangeClaims(appointment, 'no_show');
    expect(clinicalPool.execute.mock.calls[1][1]).toEqual(['no_show', expect.stringContaining('nonbillable'), 2, 1, 3, 4]);
  });
  it('preserves existing signed service documentation', async () => {
    clinicalPool.execute.mockResolvedValueOnce([[{ id: 12 }]]);
    await expect(blockAppointmentChangeClaims(appointment, 'canceled')).rejects.toThrow('already has signed');
    expect(clinicalPool.execute).toHaveBeenCalledOnce();
  });
  it('blocks explicit claim creation when the session did not occur', async () => {
    clinicalPool.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);
    await expect(ClinicalClaim.create({ clinicalSessionId: 3, agencyId: 2, clientId: 5, createdByUserId: 8 })).rejects.toThrow('Claim creation is blocked');
    const [sql, values] = clinicalPool.execute.mock.calls[0];
    expect(sql).toContain("'no_show', 'cancelled', 'canceled', 'voided', 'rescheduled'"); expect(values.slice(-3)).toEqual([3, 2, 5]);
  });
});
