import { expect, it, vi } from 'vitest';
import { providerBiographyPermissions, saveSchoolBiography } from '../providerBiography.js';

it.each(['provider', 'provider_plus', 'supervisor', 'clinical_practice_assistant', 'intern', 'intern_plus'])('lets %s owners edit both biographies when affiliated with a school', role => {
  expect(providerBiographyPermissions({ id: 7, role, has_supervisor_privileges: true }, 7, [{ id: 30, organization_type: 'school' }]))
    .toEqual({ canEditPublic: true, canEditSchool: true, hasSchool: true });
});
it.each([{ affiliations: [] }, { affiliations: [{ organization_type: 'program' }] }, { affiliations: [{ organization_type: 'school', is_active: 0 }] }])('keeps the school biography unavailable without a current school affiliation: %j', ({ affiliations }) => {
  expect(providerBiographyPermissions({ id: 7, role: 'provider' }, 7, affiliations))
    .toEqual({ canEditPublic: true, canEditSchool: false, hasSchool: false });
});
it('does not enable editing someone else’s biographies for a provider', () => {
  expect(providerBiographyPermissions({ id: 7, role: 'provider' }, 9, [{ organization_type: 'school' }]))
    .toEqual({ canEditPublic: false, canEditSchool: false, hasSchool: true });
});
it('keeps authorized management available and requires an actual school for managers too', () => {
  expect(providerBiographyPermissions({ id: 8, role: 'admin' }, 7, [{ organization_type: 'school' }]).canEditSchool).toBe(true);
  expect(providerBiographyPermissions({ id: 7, role: 'super_admin' }, 7, []).canEditSchool).toBe(false);
});
it('sends only the school affiliation and biography to the dedicated save endpoint', async () => {
  const api = { put: vi.fn(async () => ({ data: { ok: true } })) };
  await saveSchoolBiography(api, { userId: 7, schoolId: 30, schoolBlurb: '  School introduction  ' });
  expect(api.put).toHaveBeenCalledExactlyOnceWith('/users/7/provider-school-biography', { schoolId: 30, schoolBlurb: 'School introduction' });
  await saveSchoolBiography(api, { userId: 7, schoolId: 30, schoolBlurb: '' });
  expect(api.put).toHaveBeenLastCalledWith('/users/7/provider-school-biography', { schoolId: 30, schoolBlurb: null });
});
it('does not submit a school biography without an affiliation selection', () => {
  const api = { put: vi.fn() };
  expect(() => saveSchoolBiography(api, { userId: 7, schoolId: 0, schoolBlurb: 'Introduction' })).toThrow('affiliated school');
  expect(api.put).not.toHaveBeenCalled();
});
