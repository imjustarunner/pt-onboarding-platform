import AgencyMedicalServiceCode from '../models/AgencyMedicalServiceCode.model.js';
import { testingServiceDefinition } from '../content/testingServicePolicy.js';

/** Visibility in the reference inventory never establishes claim eligibility. */
export async function assertConfiguredTestingReferenceCodes({ agencyId, serviceCodes = [] }, overrides = {}) {
  const find = overrides.find || ((id, code) => AgencyMedicalServiceCode.findByAgencyAndCode(id, code));
  const codes = [...new Set(serviceCodes.map(code => String(code || '').trim().toUpperCase()).filter(code => testingServiceDefinition(code)))];
  for (const code of codes) {
    const saved = await find(Number(agencyId), code);
    if (!saved || !(saved.isActive === true || Number(saved.is_active) === 1)) throw Object.assign(new Error(`${code} is an inactive catalog reference. Verify and explicitly enable its clinical billing setup before creating or submitting a claim.`), { status: 403, code: 'SERVICE_CODE_INACTIVE' });
    if (String(saved.unitCalcMode || saved.unit_calc_mode || '').toUpperCase() === 'NONE') throw Object.assign(new Error(`Complete the verified claim-unit setup for ${code} before creating or submitting a claim.`), { status: 409, code: 'SERVICE_UNIT_SETUP_REQUIRED' });
  }
}
