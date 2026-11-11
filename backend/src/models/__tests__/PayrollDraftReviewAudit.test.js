import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { getConnection: vi.fn(), execute: vi.fn() } }));
import pool from '../../config/database.js';
import Audit from '../PayrollImportRowAudit.model.js';
let db;
const decision = () => ({ row: { id: 40, payroll_import_id: 15, payroll_period_id: 11, agency_id: 6, draft_payable: 1 }, draftPayable: false, changedByUserId: 9, expectedPeriodStatus: 'posted' });
beforeEach(() => {
  vi.clearAllMocks();
  db = { beginTransaction: vi.fn(), execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  pool.getConnection.mockResolvedValue(db);
});
it('commits the choice and its attributed review record together', async () => {
  await Audit.saveDraftDecision(decision());
  expect(db.beginTransaction).toHaveBeenCalledOnce();
  expect(db.execute.mock.calls[0][1]).toEqual([0, 40, 15, 11, 6, 1, 'posted']);
  expect(db.execute.mock.calls[1][1]).toEqual([40, 15, 11, 6, 'draft_reviewed', '1', '0', 9]);
  expect(db.commit).toHaveBeenCalledOnce();
  expect(db.rollback).not.toHaveBeenCalled();
  expect(db.release).toHaveBeenCalledOnce();
});
it('rolls back the payment choice if its review evidence cannot be saved', async () => {
  db.execute.mockResolvedValueOnce([{ affectedRows: 1 }]).mockRejectedValueOnce(new Error('Audit storage failed'));
  await expect(Audit.saveDraftDecision(decision())).rejects.toThrow('Audit storage failed');
  expect(db.rollback).toHaveBeenCalledOnce();
  expect(db.commit).not.toHaveBeenCalled();
  expect(db.release).toHaveBeenCalledOnce();
});
it('rejects a concurrent period or draft change before recording a review', async () => {
  db.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);
  await expect(Audit.saveDraftDecision(decision())).rejects.toMatchObject({ statusCode: 409 });
  expect(db.execute).toHaveBeenCalledOnce();
  expect(db.rollback).toHaveBeenCalledOnce();
  expect(db.commit).not.toHaveBeenCalled();
});
