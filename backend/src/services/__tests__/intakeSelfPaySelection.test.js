import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../clientInsurance.service.js', () => ({ readClientInsurance: vi.fn() }));
vi.mock('../../utils/resolveInsuranceTypeId.js', () => ({ resolveInsuranceTypeIdForAgency: vi.fn() }));
import { recordIntakeSelfPaySelection } from '../intakeSelfPaySelection.service.js';
let client, calls, deps, connection;
beforeEach(() => {
  client = { id: 3, insurance_type_id: null, primary_insurer_name: null, billing_insurance_payload: null, insurance_type_label: null, insurance_key: null };
  calls = [];
  connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
    execute: vi.fn(async (sql, args) => { calls.push([sql, args]); return sql.startsWith('SELECT') ? [[client].filter(Boolean)] : [{ affectedRows: 1 }]; }) };
  deps = { database: { getConnection: vi.fn(async () => connection) }, resolveType: vi.fn(async () => 40), readInsurance: vi.fn(async () => null) };
});
it('requires an explicit choice and never infers cash from missing coverage', async () => {
  expect(await recordIntakeSelfPaySelection({ clientId: 3, agencyId: 450 }, deps)).toEqual({ status: 'not_selected', applied: false });
  expect(deps.database.getConnection).not.toHaveBeenCalled();
});
it('records the scoped explicit self-pay label without creating insurance verification or financial transactions', async () => {
  expect(await recordIntakeSelfPaySelection({ clientId: 3, agencyId: 450, isSelfPay: true }, deps)).toEqual({ status: 'self_pay_recorded', applied: true });
  expect(calls[0][1]).toEqual([3, 450]);
  expect(calls[1][1]).toEqual(['Self Pay', 40, 3, 450]);
  expect(calls.map(([sql]) => sql).join('\n')).not.toMatch(/claim|charge|signature|ledger|consent/i);
  expect(connection.commit).toHaveBeenCalledOnce();
});
it.each(['Medicaid','Commercial','Health First Colorado'])('preserves existing %s coverage for billing review', async label => {
  client.insurance_type_label = label; client.insurance_type_id = 50;
  expect(await recordIntakeSelfPaySelection({ clientId: 3, agencyId: 450, isSelfPay: true }, deps)).toEqual({ status: 'existing_coverage_requires_review', applied: false });
  expect(calls).toHaveLength(1); expect(deps.resolveType).not.toHaveBeenCalled();
});
it('preserves another guardian’s encrypted coverage even if the display label is empty', async () => {
  client.billing_insurance_payload = 'encrypted'; deps.readInsurance.mockResolvedValue({ primary: { insurerName: 'Commercial' }, secondary: { isMedicaid: true, memberId: 'synthetic' } });
  expect((await recordIntakeSelfPaySelection({ clientId: 3, agencyId: 450, isSelfPay: true }, deps)).applied).toBe(false);
  expect(calls).toHaveLength(1);
});
it('holds unreadable coverage instead of turning it into cash', async () => {
  client.billing_insurance_payload = 'encrypted'; deps.readInsurance.mockRejectedValue(new Error('Coverage unreadable'));
  await expect(recordIntakeSelfPaySelection({ clientId: 3, agencyId: 450, isSelfPay: true }, deps)).rejects.toThrow('Coverage unreadable');
  expect(connection.rollback).toHaveBeenCalledOnce(); expect(calls).toHaveLength(1);
});
it('refuses an out-of-agency client and never writes a global fallback', async () => {
  client = null;
  await expect(recordIntakeSelfPaySelection({ clientId: 3, agencyId: 999, isSelfPay: true }, deps)).rejects.toMatchObject({ status: 404 });
  expect(calls).toHaveLength(1); expect(calls[0][1]).toEqual([3, 999]);
});
it('reuses an existing cash selection without rewriting a price or signed financial record', async () => {
  Object.assign(client, { insurance_type_id: 40, primary_insurer_name: 'Self Pay', insurance_type_label: 'Self Pay', insurance_key: 'self_pay' });
  expect((await recordIntakeSelfPaySelection({ clientId: 3, agencyId: 450, isSelfPay: true }, deps)).applied).toBe(true);
  expect(calls).toHaveLength(1);
});
