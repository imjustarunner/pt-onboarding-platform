import { beforeEach, expect, it, vi } from 'vitest';
import { ensureClinicalImportedPlanFrequencySchema, importedPlanFrequencyMigration, clinicalImportedPlanFrequencyReadiness,
  ensureClinicalTreatmentObjectiveDateSchema, treatmentObjectiveDateMigration, clinicalTreatmentObjectiveDateReadiness } from '../clinicalImportedPlanFrequencySchema.service.js';

let type, nullable, acquired, connection, database;
beforeEach(() => {
  type = 'varchar'; nullable = 'YES'; acquired = 1;
  connection = {
    execute: vi.fn(async sql => {
      if (sql.includes('DATABASE() AS')) return [[{ schema_name: 'synthetic_clinical' }]];
      if (sql.includes('GET_LOCK')) return [[{ acquired }]];
      if (sql.includes('INFORMATION_SCHEMA')) return [[{ data_type: type, is_nullable: nullable }]];
      return [{}];
    }),
    query: vi.fn(async sql => { if (sql.startsWith('ALTER TABLE')) { type = 'mediumtext'; nullable = 'YES'; } return [{}]; }),
    destroy: vi.fn()
  };
  database = { getConnection: vi.fn(async () => connection) };
});

it('widens the clinical field and verifies it before recording migration success', async () => {
  expect(await ensureClinicalImportedPlanFrequencySchema(database)).toEqual({ migration: importedPlanFrequencyMigration, dataType: 'mediumtext', applied: true });
  expect(connection.query).toHaveBeenCalledWith('ALTER TABLE clinical_treatment_plans MODIFY COLUMN prescribed_frequency MEDIUMTEXT NULL');
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO clinical_migrations_log'), [importedPlanFrequencyMigration]);
  expect(connection.execute).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', [expect.any(String)]);
  expect(connection.destroy).toHaveBeenCalledOnce();
  expect(clinicalImportedPlanFrequencyReadiness()).toMatchObject({ migration: importedPlanFrequencyMigration, dataType: 'mediumtext' });
});

it.each(['mediumtext', 'longtext'])('retains an already compatible %s column on retries', async existingType => {
  type = existingType;
  expect(await ensureClinicalImportedPlanFrequencySchema(database)).toMatchObject({ dataType: existingType, applied: false });
  expect(connection.query.mock.calls.some(([sql]) => sql.startsWith('ALTER TABLE'))).toBe(false);
  expect(connection.destroy).toHaveBeenCalledOnce();
});

it('keeps startup blocked and records no success if widening is denied', async () => {
  connection.query.mockRejectedValueOnce(Object.assign(new Error('Synthetic schema access denied'), { code: 'ER_TABLEACCESS_DENIED_ERROR' }));
  await expect(ensureClinicalImportedPlanFrequencySchema(database)).rejects.toMatchObject({ code: 'CLINICAL_PLAN_FREQUENCY_SCHEMA_UNAVAILABLE', requiredMigration: importedPlanFrequencyMigration });
  expect(clinicalImportedPlanFrequencyReadiness()).toBeNull();
  expect(connection.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO clinical_migrations_log'))).toBe(false);
  expect(connection.execute).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', [expect.any(String)]);
  expect(connection.destroy).toHaveBeenCalledOnce();
});

it('verifies the actual column after DDL rather than trusting a successful query', async () => {
  connection.query.mockResolvedValue([{}]);
  await expect(ensureClinicalImportedPlanFrequencySchema(database)).rejects.toMatchObject({ code: 'CLINICAL_PLAN_FREQUENCY_SCHEMA_UNAVAILABLE' });
  expect(connection.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO clinical_migrations_log'))).toBe(false);
});

it('never releases another instance’s lock or changes schema when the lock is unavailable', async () => {
  acquired = 0;
  await expect(ensureClinicalImportedPlanFrequencySchema(database)).rejects.toMatchObject({ code: 'CLINICAL_PLAN_FREQUENCY_SCHEMA_UNAVAILABLE' });
  expect(connection.query).not.toHaveBeenCalled();
  expect(connection.execute.mock.calls.some(([sql]) => sql.includes('RELEASE_LOCK'))).toBe(false);
  expect(connection.destroy).toHaveBeenCalledOnce();
});


it('repairs a missing objective target-date column and skips DDL on the next startup', async () => {
  let objectiveColumn;
  connection.execute.mockImplementation(async sql => {
    if (sql.includes('DATABASE() AS')) return [[{ schema_name: 'synthetic_clinical' }]];
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('INFORMATION_SCHEMA')) return [objectiveColumn ? [objectiveColumn] : []];
    return [{}];
  });
  connection.query.mockImplementation(async sql => {
    if (sql.startsWith('ALTER TABLE')) objectiveColumn = { data_type: 'date', is_nullable: 'YES' };
    return [{}];
  });
  expect(await ensureClinicalTreatmentObjectiveDateSchema(database)).toEqual({
    migration: treatmentObjectiveDateMigration, dataType: 'date', applied: true
  });
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INFORMATION_SCHEMA.COLUMNS'), [
    'clinical_treatment_plan_objectives', 'projected_completion'
  ]);
  expect(connection.query).toHaveBeenCalledWith(expect.stringMatching(/ALTER TABLE clinical_treatment_plan_objectives\s+ADD COLUMN projected_completion DATE NULL/));
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO clinical_migrations_log'), [treatmentObjectiveDateMigration]);
  expect(await ensureClinicalTreatmentObjectiveDateSchema(database)).toMatchObject({ dataType: 'date', applied: false });
  expect(connection.query.mock.calls.filter(([sql]) => sql.startsWith('ALTER TABLE'))).toHaveLength(1);
});

it('preserves an incompatible objective date column and withholds readiness', async () => {
  await expect(ensureClinicalTreatmentObjectiveDateSchema(database)).rejects.toMatchObject({
    code: 'CLINICAL_PLAN_OBJECTIVE_DATE_SCHEMA_UNAVAILABLE', requiredMigration: treatmentObjectiveDateMigration
  });
  expect(clinicalTreatmentObjectiveDateReadiness()).toBeNull();
  expect(connection.query).not.toHaveBeenCalled();
});
