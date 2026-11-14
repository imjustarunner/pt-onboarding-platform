import { TESTING_SERVICE_CODES, testingServiceDefinition, testingCompensationBasis, requiresTestingRole } from '../content/testingServicePolicy.js';
import { payrollDefaultsForCode } from './payrollServiceCodeDefaults.js';
import { handbookTenant } from './handbookTenant.js';

export function medicalCatalogActiveChoice(requested, existing, code) {
  if (requested === undefined) return existing ? !!existing.isActive : !requiresTestingRole(code);
  if ([true, 1, '1', 'true'].includes(requested)) return true;
  if ([false, 0, '0', 'false'].includes(requested)) return false;
  throw Object.assign(new Error('Choose whether this service code is enabled.'), { status: 400 });
}

/** Inserts only missing references. Existing agency setup and active status win. */
export function planTestingInventoryReferences(agency, saved = []) {
  if (!handbookTenant(agency)) return [];
  const existing = new Set(saved.map(row => String(row.service_code || row.serviceCode || '').trim().toUpperCase()));
  return TESTING_SERVICE_CODES.filter(def => !existing.has(def.code)).map(def => ({
    agencyId: Number(agency.id), serviceCode: def.code, description: def.name,
    unitCalcMode: 'NONE', unitMinutes: null, minMinutes: null, maxMinutes: null,
    isAddon: !!def.baseCode, isActive: false, sessionMode: 'individual',
    inventory: serviceCodeInventoryPresentation(def.code)
  }));
}

/** Display classifications describe work and time; they never activate a claim. */
export function serviceCodeInventoryPresentation(serviceCode) {
  const code = String(serviceCode || '').trim().toUpperCase();
  const testing = testingServiceDefinition(code);
  if (testing) return {
    group: testing.requiredRole ? testing.bucket === 'credit' ? 'testing-evaluation' : 'testing-administration' : 'direct-care',
    groupLabel: testing.requiredRole ? testing.bucket === 'credit' ? 'Testing · evaluation' : 'Testing · administration/scoring' : 'Related clinical service',
    payBucket: testing.bucket, payLabel: testing.bucket === 'credit' ? 'Clinical Session Rate' : 'Direct Care Rate',
    compensationBasis: testingCompensationBasis(testing), requiredRole: testing.requiredRole,
    medicaidOnly: !!testing.medicaidOnly, baseCode: testing.baseCode || null,
    claimTiming: testing.claimBasis === 'encounter'
      ? `${Number(testing.minimumMinutes) > 0 && Number(testing.maximumMinutes) >= Number(testing.minimumMinutes) ? `${testing.minimumMinutes}–${testing.maximumMinutes} minutes; ` : ''}encounter-based claim. Record actual employee work minutes separately.`
      : Number(testing.nominalMinutes) > 0 ? `${testing.nominalMinutes}-minute claim increment; verify cumulative-time and add-on rules.` : 'Verify the service-specific timed claim rules; record actual employee work minutes separately.',
    setupNotice: testing.requiredRole ? 'Testing role, assigned component, qualifications, Medicaid coverage and payer/unit setup must be verified before use.' : null
  };
  const defaults = payrollDefaultsForCode(code);
  if (code === 'H2014') return { group: 'program', groupLabel: 'Program service', payLabel: 'Approved H2014 program schedule', compensationBasis: 'Use the separately agreed program rate and service-specific unit mapping; do not substitute the general Direct Care rate.' };
  if (['indirect', 'admin', 'meeting'].includes(defaults?.category)) return { group: 'indirect', groupLabel: 'Indirect / support', payLabel: 'Approved indirect/support rate', compensationBasis: 'Record actual compensable work once.' };
  if (defaults?.category === 'tutoring' || /^TUTORING|HOMEWORK HELP/.test(code)) return { group: 'tutoring', groupLabel: 'Tutoring / learning', payLabel: 'Approved tutoring schedule', compensationBasis: 'Actual tutoring time and its agreed indirect allowance.' };
  if (/^CHILDCARE/.test(code)) return { group: 'childcare', groupLabel: 'Childcare', payLabel: 'Approved childcare schedule', compensationBasis: 'Actual assigned care time and approved child-count band.' };
  if (code === '99051' || code === '90785') return { group: 'addon', groupLabel: 'Clinical add-on', payLabel: 'Approved add-on schedule', compensationBasis: 'No separate clinical hour or automatic full credit.' };
  if (/^H\d|^S\d|^T\d/.test(code)) return { group: 'direct-care', groupLabel: 'Direct Care / skills', payLabel: 'Direct Care Rate', compensationBasis: 'Apply the saved service-specific unit and compensation mapping.' };
  if (/^9\d{4}$/.test(code)) return { group: 'clinical', groupLabel: 'Clinical service', payLabel: 'Approved clinical schedule', compensationBasis: 'Apply the saved code-specific credit and rate rules.' };
  return { group: 'other', groupLabel: 'Other service', payLabel: 'Approved service schedule', compensationBasis: 'Use the saved service-specific rules.' };
}
