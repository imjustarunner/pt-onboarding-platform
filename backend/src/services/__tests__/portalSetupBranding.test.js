import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/OrganizationAffiliation.model.js', () => ({ default: { getActiveAgencyIdForOrganization: vi.fn() } }));
vi.mock('../../models/AgencySchool.model.js', () => ({ default: { getActiveAgencyIdForSchool: vi.fn() } }));
import User from '../../models/User.model.js';
import Agency from '../../models/Agency.model.js';
import Affiliation from '../../models/OrganizationAffiliation.model.js';
import { buildPasswordRecoveryBranding } from '../passwordRecoveryBranding.service.js';
const tenant = { id: 1, slug: 'itsco', organization_type: 'agency', name: 'ITSCO' };
const other = { id: 4, slug: 'other', organization_type: 'agency', name: 'Other' };
const learning = { id: 3, slug: 'tutoring', organization_type: 'learning', name: 'Tutoring' };
beforeEach(() => { vi.resetAllMocks(); User.getAgencies.mockResolvedValue([other, tenant, learning]); });
it('brands the setup screen for the invited tenant rather than the first membership', async () => {
  const result = await buildPasswordRecoveryBranding({ query: { portal: 'itsco' } }, { id: 10, role: 'client_guardian' });
  expect(result.tenant).toMatchObject({ id: 1, name: 'ITSCO' });
});
it('resolves tutoring’s own parent tenant', async () => {
  Affiliation.getActiveAgencyIdForOrganization.mockResolvedValue(1); Agency.findById.mockResolvedValue(tenant);
  const result = await buildPasswordRecoveryBranding({ query: { portal: 'tutoring' } }, { id: 10, role: 'client_guardian' });
  expect(result.tenant.id).toBe(1); expect(Affiliation.getActiveAgencyIdForOrganization).toHaveBeenCalledWith(3);
});
it('ignores an unlinked portal supplied in the URL', async () => {
  const result = await buildPasswordRecoveryBranding({ query: { portal: 'unlinked' } }, { id: 10, role: 'client_guardian' });
  expect(result.tenant.id).toBe(4); expect(Agency.findById).not.toHaveBeenCalled();
});
