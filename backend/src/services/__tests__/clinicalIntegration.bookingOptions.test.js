import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(async () => [[]]) } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 501, role: 'provider', credential: 'LPC' })) } }));
vi.mock('../schedulingTaxonomy.service.js', () => ({ getSchedulingBookingMetadata: vi.fn(), validateSchedulingSelection: vi.fn() }));
vi.mock('../medicalBillingDefaults.service.js', () => ({ ensureAgencyMedicalBillingDefaults: vi.fn(), filterCodesForProviderTier: rows => rows, parseAllowedCredentialTiers: () => ['intern_plus'] }));
vi.mock('../tenantServiceSuiteDefaults.service.js', () => ({ ensureTenantServiceSuitesForAgency: vi.fn() }));
vi.mock('../../models/AgencyMedicalServiceCode.model.js', () => ({ default: { listByAgency: vi.fn() } }));
vi.mock('../../models/AgencyServiceLocation.model.js', () => ({ default: { listByAgency: vi.fn(async () => []) } }));
vi.mock('../../models/TenantService.model.js', () => ({ default: { listForAgency: vi.fn() } }));
vi.mock('../officeBillingSites.service.js', () => ({ listUserOfficeIds: async () => [], filterServiceLocationsForProvider: rows => rows }));
import { getSchedulingBookingMetadata } from '../schedulingTaxonomy.service.js';
import Medical from '../../models/AgencyMedicalServiceCode.model.js';
import Tenant from '../../models/TenantService.model.js';
import { getBookingMetadata } from '../../controllers/officeSchedule.controller.js';
beforeEach(() => {
  vi.clearAllMocks();
  getSchedulingBookingMetadata.mockResolvedValue({ careEligibility: { canProvideCare: true }, credentialTier: 'intern_plus', eligibleServiceCodes: [{ code: '90791', minDurationMinutes: 45 }] });
  Medical.listByAgency.mockResolvedValue([{ service_code: '90791', min_minutes: 20 },{ service_code: '90785' },{ service_code: '90837' }]);
  Tenant.listForAgency.mockResolvedValue([{ id: 2, serviceCode: '90837', businessType: 'mental_health' },{ id: 3, serviceCode: '99999', businessType: 'mental_health' }]);
});
it('the actual booking endpoint cannot re-add excluded codes through medical or tenant enrichment', async () => {
  const res = { json: vi.fn() }, next = vi.fn();
  await getBookingMetadata({ user: { id: 501, role: 'provider' }, query: { agencyId: 377 } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json.mock.calls[0][0].serviceCodes).toEqual([expect.objectContaining({ code: '90791', minDurationMinutes: 45 })]);
});
