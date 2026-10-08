import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: db }));
vi.mock('../../services/lifecycleSync.service.js', () => ({ syncLifecycleItems: vi.fn() }));
vi.mock('../../services/lifecycleScope.service.js', () => ({ scopeLifecycleItem: vi.fn(), backfillScopeFromExistingAssignments: vi.fn() }));
vi.mock('../../services/d11Compliance.service.js', () => ({ ensureD11ComplianceForProvider: vi.fn() }));
vi.mock('../../utils/districtCompliance.js', () => ({ listProviderDistrictFlags: async () => ({ hasD11: false }), providerHasDistrict11Assignment: async () => false }));
vi.mock('../../services/leaveOfAbsence.service.js', () => ({ getLeaveInfoForUserIds: async () => new Map() }));
vi.mock('../../services/storage.service.js', () => ({ default: {} }));
vi.mock('../../services/documentEncryption.service.js', () => ({ default: {} }));
vi.mock('../../services/pdfCompression.service.js', () => ({ compressPdfBuffer: vi.fn() }));

import { updateLifecycleDates } from '../lifecycle.controller.js';
import { getLifecycleData } from '../../services/lifecycle.service.js';

const definitions = { start_date: 1, first_client_date: 2, employment_agreement_date: 3 };
let values, missingDefinition;
beforeEach(() => {
  values = new Map([[1, '2024-01-01'], [2, '2024-03-01']]);
  missingDefinition = false;
  db.execute.mockReset().mockImplementation(async (sql, params = []) => {
    if (sql.includes('SELECT id FROM user_info_field_definitions')) {
      return [missingDefinition ? [] : [{ id: definitions[params[0]] }]];
    }
    if (sql.includes('INSERT INTO user_info_values')) { values.set(params[1], params[2]); return [{ affectedRows: 1 }]; }
    if (sql.includes('DELETE FROM user_info_values')) { values.delete(params[1]); return [{ affectedRows: 1 }]; }
    if (sql.includes('SELECT uifd.field_key, uiv.value')) {
      return [Object.entries(definitions).filter(([, id]) => values.has(id)).map(([field_key, id]) => ({ field_key, value: values.get(id) }))];
    }
    if (sql.includes('SELECT id, first_name, last_name, status, role')) {
      return [[{ id: 42, first_name: 'Test', last_name: 'Employee', status: 'ACTIVE_EMPLOYEE', role: 'provider', is_active: 1 }]];
    }
    return [[]];
  });
});

async function patch(body) {
  const res = { json: vi.fn(), status: vi.fn().mockReturnThis() }, next = vi.fn();
  await updateLifecycleDates({ params: { id: '42' }, body }, res, next);
  return { res, next };
}

describe('lifecycle date save and refresh', () => {
  it('persists a manually entered agreement date through the endpoint and reloads it without changing original dates', async () => {
    const { res, next } = await patch({ employment_agreement_date: '2026-10-10' });
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    const refreshed = await getLifecycleData(42);
    expect(refreshed.dates).toMatchObject({ start_date: '2024-01-01', first_client_date: '2024-03-01', employment_agreement_date: '2026-10-10', probation_end_date: '2024-03-31' });
    expect(refreshed.onboarding.employmentDates.employmentAgreementDate).toBe('2026-10-10');
  });

  it('can clear a manually entered agreement date', async () => {
    values.set(3, '2026-10-10');
    const { next } = await patch({ employment_agreement_date: null });
    expect(next).not.toHaveBeenCalled();
    expect((await getLifecycleData(42)).onboarding.employmentDates.employmentAgreementDate).toBeNull();
    expect(values.get(1)).toBe('2024-01-01');
  });

  it('does not accept retired dates or overwrite the calculated probation end', async () => {
    await patch({ orientation_date: '2026-10-10', offer_accepted_date: '2026-10-10', therapy_notes_training_date: '2026-10-10', first_payroll_submission_date: '2026-10-10', probation_end_date: '2028-01-01' });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('rejects an impossible agreement date before writing any values', async () => {
    const { res, next } = await patch({ employment_agreement_date: '2026-02-30' });
    expect(next.mock.calls[0][0]).toMatchObject({ status: 400 });
    expect(res.json).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('reports unavailable field storage instead of falsely reporting a successful save', async () => {
    missingDefinition = true;
    const { res, next } = await patch({ employment_agreement_date: '2026-10-10' });
    expect(next.mock.calls[0][0]).toMatchObject({ status: 503 });
    expect(res.json).not.toHaveBeenCalled();
    expect(values.has(3)).toBe(false);
  });
});
