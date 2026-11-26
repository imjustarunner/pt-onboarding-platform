import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({getConnection:vi.fn(),execute:vi.fn(),upsertDiagnosis:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{getConnection:m.getConnection,execute:m.execute}}));
vi.mock('../../services/clinicalDiagnosisAttach.service.js',()=>({upsertClinicalDiagnosis:m.upsertDiagnosis}));
import { normalizeTreatmentPlanDiagnoses } from '../../services/treatmentPlanPrecedence.service.js';
import Plan from '../clinical/ClinicalTreatmentPlan.model.js';
let conn,source;
beforeEach(()=>{
 vi.restoreAllMocks();source={status:'draft',source_tool_id:'client_records_import:synthetic'};
 conn={execute:vi.fn(async sql=>sql.startsWith('SELECT status')?[[source]]:sql.startsWith('INSERT')?[{insertId:55}]:[{affectedRows:1}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};m.getConnection.mockResolvedValue(conn);vi.spyOn(Plan,'findById').mockResolvedValue({id:55,status:'active'});
});
it('archives the imported source draft in the same transaction as its provider-finalized replacement',async()=>{
 await Plan.create({agencyId:2,clientId:42,createdByUserId:10,status:'active',supersedesImportedDraftId:44,goals:[]});
 expect(conn.execute.mock.calls[0]).toEqual([expect.stringContaining('FOR UPDATE'),[44,2,42]]);
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining("status = 'superseded'"),[44,2,42]);expect(conn.commit).toHaveBeenCalledOnce();expect(conn.rollback).not.toHaveBeenCalled();
});
it.each([null,{status:'active',source_tool_id:'client_records_import:source'},{status:'draft',source_tool_id:'other'}])('preserves a missing, already finalized or unrelated source (%j)',async value=>{
 source=value;await expect(Plan.create({agencyId:2,clientId:42,createdByUserId:10,supersedesImportedDraftId:44})).rejects.toHaveProperty('status',409);
 expect(conn.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);expect(conn.commit).not.toHaveBeenCalled();expect(conn.rollback).toHaveBeenCalledOnce();
});

it('saves a single ordered primary and code-specific justifications within the plan transaction', async () => {
  const diagnoses = normalizeTreatmentPlanDiagnoses([
    { icd10_code: 'z55.3' },
    { icd10Code: 'F41.9', isPrimary: true, justification: 'Reviewed primary rationale.' },
    { icd10Code: 'Z55.3', isPrimary: false, justification: 'Duplicate code.' }
  ]);
  conn.execute.mockImplementation(async sql => {
    if (sql.startsWith('SELECT icd10_code')) return [[{ icd10_code: 'Z55.3', justification: 'Existing secondary rationale.' }]];
    if (sql.startsWith('INSERT INTO clinical_treatment_plans')) return [{ insertId: 55 }];
    return [{ affectedRows: 1 }];
  });
  m.upsertDiagnosis.mockReset().mockResolvedValueOnce(61).mockResolvedValueOnce(62);

  await Plan.create({ agencyId: 2, clientId: 42, createdByUserId: 10, diagnoses });

  expect(m.upsertDiagnosis.mock.calls).toEqual([
    [expect.objectContaining({ icd10Code: 'F41.9', setPrimary: true, justification: 'Reviewed primary rationale.' }), { transaction: conn }],
    [expect.objectContaining({ icd10Code: 'Z55.3', setPrimary: false, justification: 'Existing secondary rationale.' }), { transaction: conn }]
  ]);
  const planInsert = conn.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO clinical_treatment_plans'));
  expect(planInsert[1].slice(-2)).toEqual([61, 'Reviewed primary rationale.']);
  const links = conn.execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO clinical_treatment_plan_diagnoses'));
  expect(links.map(([, parameters]) => parameters)).toEqual([
    [55, 61, 1, 1, 'Reviewed primary rationale.'],
    [55, 62, 2, 0, 'Existing secondary rationale.']
  ]);
  expect(conn.commit).toHaveBeenCalledOnce();
});

it('rolls back chart diagnosis and plan changes when saving a later diagnosis fails', async () => {
  const diagnoses = normalizeTreatmentPlanDiagnoses([
    { icd10Code: 'F41.9', justification: 'Reviewed primary rationale.' },
    { icd10Code: 'Z55.3' }
  ]);
  conn.execute.mockResolvedValueOnce([[]]);
  m.upsertDiagnosis.mockReset().mockResolvedValueOnce(61).mockRejectedValueOnce(new Error('Missing secondary justification'));

  await expect(Plan.create({ agencyId: 2, clientId: 42, createdByUserId: 10, diagnoses })).rejects.toThrow('Missing secondary justification');
  expect(m.upsertDiagnosis.mock.calls[1][0].justification).toBeNull();
  expect(conn.commit).not.toHaveBeenCalled();
  expect(conn.rollback).toHaveBeenCalledOnce();
  expect(Plan.findById).not.toHaveBeenCalled();
});
