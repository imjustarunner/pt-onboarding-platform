import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { authenticatedLoginOrganization } from '../loginWorkspace';
import { getDashboardRoute } from '../router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import { useOrganizationStore } from '../../store/organization';

vi.mock('../../services/api', () => ({ default: { get: vi.fn(async () => ({ data: [] })), post: vi.fn(async () => ({ data: {} })) } }));
const qa = { id: 453, slug: 'nlu-qa-demo', organization_type: 'agency' };
const learning = { id: 454, slug: 'nlu-qa-learning', organization_type: 'learning' };
const school = { id: 451, slug: 'cedar-grove', organization_type: 'school' };
const live = { id: 6, slug: 'nlu', organization_type: 'agency' };

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); setActivePinia(createPinia()); });

describe('account-based login workspace', () => {
  it('ignores both an unrelated login page and a stale previous-user selection', () => {
    expect(authenticatedLoginOrganization({ agencies: [learning, qa], role: 'provider', requestedSlug: 'nlu', currentAgency: live })).toEqual(qa);
  });
  it('honors an explicit login tenant only when the authenticated account has it', () => {
    expect(authenticatedLoginOrganization({ agencies: [qa, learning], role: 'provider', requestedSlug: 'nlu-qa-learning', currentAgency: qa })).toEqual(learning);
    expect(authenticatedLoginOrganization({ agencies: [qa], role: 'provider', requestedSlug: 'nlu' })).toEqual(qa);
  });
  it('gives school staff their school context from an agency-branded login', () => {
    expect(authenticatedLoginOrganization({ agencies: [qa, school], role: 'school_staff', requestedSlug: qa.slug, currentAgency: qa })).toEqual(school);
  });
  it('preserves the authenticated user’s explicit current workspace and handles no memberships', () => {
    expect(authenticatedLoginOrganization({ agencies: [qa, learning], role: 'support', currentAgency: learning })).toEqual(learning);
    expect(authenticatedLoginOrganization({ agencies: [], role: 'provider', requestedSlug: 'nlu' })).toBeNull();
    expect(authenticatedLoginOrganization({ agencies: [qa], role: 'super_admin', requestedSlug: qa.slug })).toBeNull();
  });

  it.each(['admin', 'support'])('lands %s in their selected QA agency rather than the live agency owning this host', role => {
    const user = { id: 77, role };
    useAuthStore().setAuth(null, user);
    useAgencyStore().userAgencies = [qa, learning];
    useAgencyStore().currentAgency = qa;
    useOrganizationStore().setCurrentOrganization(qa);
    useBrandingStore().portalHostPortalUrl = 'nlu';
    expect(getDashboardRoute()).toBe('/nlu-qa-demo/admin');
    useAgencyStore().currentAgency = learning;
    expect(getDashboardRoute()).toBe('/nlu-qa-learning/dashboard');
  });
  it('keeps provider and school staff landing routes tied to their memberships', () => {
    useAuthStore().setAuth(null, { id: 1496, role: 'provider' });
    useAgencyStore().userAgencies = [learning, qa];
    useAgencyStore().currentAgency = qa;
    useOrganizationStore().setCurrentOrganization(qa);
    useBrandingStore().portalHostPortalUrl = 'nlu';
    expect(getDashboardRoute()).toBe('/nlu-qa-demo/dashboard');
    useAuthStore().setAuth(null, { id: 1465, role: 'school_staff', agencies: [school] });
    useOrganizationStore().setCurrentOrganization(school);
    expect(getDashboardRoute()).toBe('/cedar-grove/dashboard');
  });
});
