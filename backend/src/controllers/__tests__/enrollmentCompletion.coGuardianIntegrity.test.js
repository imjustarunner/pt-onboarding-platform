import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/GuardianInsuranceProfile.model.js', () => ({ default: { upsert: vi.fn() } }));
vi.mock('../../services/clientInsurance.service.js', async importOriginal => ({ ...await importOriginal(), applySubmittedClientInsurance: vi.fn() }));
vi.mock('../../services/guardianDemographics.service.js', async importOriginal => ({ ...await importOriginal(), guardianDemographics: { enqueueFromEnrollment: vi.fn() } }));
import pool from '../../config/database.js';
import IntakeSubmission from '../../models/IntakeSubmission.model.js';
import GuardianInsuranceProfile from '../../models/GuardianInsuranceProfile.model.js';
import { applySubmittedClientInsurance } from '../../services/clientInsurance.service.js';
import { guardianDemographics } from '../../services/guardianDemographics.service.js';
import { persistChildIntakeData, buildClinicalSummaryText, repairSmartSchoolRoiClientDateOfBirthFromSubmission } from '../publicIntake.controller.js';
const chart = { agency_id: 2, full_name: 'Existing Child', date_of_birth: '2015-01-01', address_street: 'Original address' };
beforeEach(() => {
  vi.clearAllMocks();
  pool.execute.mockImplementation(async sql => sql.startsWith('SELECT agency_id') ? [[chart]] : [[]]);
  IntakeSubmission.findById.mockResolvedValue({ guardian_user_id: 12 });
  GuardianInsuranceProfile.upsert.mockResolvedValue(42);
  guardianDemographics.enqueueFromEnrollment.mockResolvedValue({ status: 'unchanged' });
});
it('keeps additional guardian demographic answers out of the established chart', async () => {
  const result = await persistChildIntakeData({ clientId: 4, submissionId: 9, clientIndex: 0,
    preserveClientDemographics: true, documentsComplete: false,
    intakeData: { clients: [{ firstName: 'Replacement', lastName: 'Identity' }], responses: { clients: [{ child_dob: '2016-02-02', client_address: 'Replacement address', child_gender: 'male' }], submission: { demographicsInfo: { dob: '2016-02-02', addressStreet: 'Replacement address', gender: 'male' } } } }
  });
  expect(result.demographicsPersisted).toBe(false);
  expect(pool.execute.mock.calls.filter(([sql]) => sql.startsWith('UPDATE clients'))).toEqual([]);
  expect(guardianDemographics.enqueueFromEnrollment).toHaveBeenCalledWith({ clientId: 4, submissionId: 9, guardianUserId: 12,
    values: { full_name: 'Replacement Identity', date_of_birth: '2016-02-02' } });
});
it('queues each child’s own details for review, not another sibling’s or the guardian’s', async () => {
  guardianDemographics.enqueueFromEnrollment.mockResolvedValue({ id: 21, status: 'pending' });
  const result = await persistChildIntakeData({ clientId: 4, submissionId: 9, clientIndex: 1,
    preserveClientDemographics: true, documentsComplete: false,
    intakeData: { guardian: { firstName: 'Parent', lastName: 'Example' },
      clients: [{ fullName: 'Sibling One' }, { firstName: 'Child', lastName: 'Two', dateOfBirth: '2016-02-02' }],
      responses: { clients: [{}, { demographicsInfo: { dob: '2016-03-03', preferredCalled: 'Their name', preferredLanguage: 'Spanish' } }],
        submission: { demographicsInfo: { dob: '2012-01-01', preferredLanguage: 'English' } } } }
  });
  expect(guardianDemographics.enqueueFromEnrollment).toHaveBeenCalledWith({ clientId: 4, submissionId: 9, guardianUserId: 12,
    values: { full_name: 'Child Two', date_of_birth: '2016-03-03', preferred_name: 'Their name', preferred_language: 'Spanish' } });
  expect(result.demographicsReview).toEqual({ id: 21, status: 'pending' });
  expect(result.demographicsPersisted).toBe(false);
});
it('keeps a failed demographic review write retryable instead of silently discarding changes', async () => {
  guardianDemographics.enqueueFromEnrollment.mockRejectedValue(new Error('Review queue unavailable'));
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(persistChildIntakeData({ clientId: 4, submissionId: 9, clientIndex: 0,
      preserveClientDemographics: true, documentsComplete: false, intakeData: { clients: [{ fullName: 'Child Example' }] }
    })).rejects.toThrow('Review queue unavailable');
    expect(applySubmittedClientInsurance).not.toHaveBeenCalled();
  } finally { logged.mockRestore(); }
});
it('stores new insurance under the submitting parent and uses existing chart identity for claims', async () => {
  await persistChildIntakeData({ clientId: 4, submissionId: 9, clientIndex: 0,
    preserveClientDemographics: true, documentsComplete: false,
    intakeData: { clients: [{ firstName: 'Replacement', lastName: 'Identity' }], responses: { submission: { insuranceInfo: { primary: { insurerName: 'Other payer', memberId: 'synthetic' } } } } }
  });
  expect(GuardianInsuranceProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({ guardianUserId: 12, clientId: 4, intakeSubmissionId: 9 }));
  expect(applySubmittedClientInsurance).toHaveBeenCalledWith(expect.objectContaining({ patient: expect.objectContaining({ firstName: 'Existing', lastName: 'Child', dateOfBirth: '2015-01-01' }), profileId: 42 }));
});
it('attributes additional guardian observations without copying the identity header into the clinician summary', () => {
  const summary = buildClinicalSummaryText({ link: { intake_fields: [] }, intakeData: {
    clients: [{ firstName: 'Private', lastName: 'Childname' }],
    guardianSubmission: { kind: 'additional_guardian', submissionId: 9, guardianUserId: 12 },
    responses: { clients: [], submission: {}, guardian: {} }
  } });
  expect(summary).toContain('Additional guardian report');
  expect(summary).toContain('observations and expectations');
  expect(summary).not.toContain('Private Childname');
});
it('does not fill an empty chart DOB from an additional guardian’s completed school ROI on retry',async()=>{
 pool.execute.mockResolvedValue([[{...chart,date_of_birth:null}]]);
 await repairSmartSchoolRoiClientDateOfBirthFromSubmission({clientId:4,link:{form_type:'smart_school_roi'},submission:{
  id:9,guardian_user_id:12,status:'submitted',intake_data:JSON.stringify({
   guardianSubmission:{kind:'additional_guardian',guardianUserId:12,submissionId:9},
   clients:[{fullName:'Child Example',dateOfBirth:'2016-02-02'}],
   smartSchoolRoi:{clientDateOfBirth:'2016-02-02'}
  })
 }});
 expect(pool.execute).not.toHaveBeenCalled();
});
