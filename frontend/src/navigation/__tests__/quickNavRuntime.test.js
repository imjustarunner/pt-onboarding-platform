import { describe, expect, it } from 'vitest';
import { createRouter, createMemoryHistory } from 'vue-router';
import { buildQuickNavContext, getAllQuickNavEntries, searchQuickNav } from '../quickNavCatalog.js';
import { canDiscoverQuickNavRoute, getRegisteredQuickNavEntries, resolveRegisteredQuickNav } from '../quickNavRuntime.js';
const component = { template: '<div />' };
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/dashboard', name: 'Dashboard', component, meta: { requiresAuth: true } },
  { path: '/:organizationSlug/dashboard', name: 'OrganizationDashboard', component, meta: { requiresAuth: true } },
  { path: '/:organizationSlug/admin/clients', name: 'OrganizationClients', component, meta: { requiresRole: ['admin', 'provider'] } },
  { path: '/admin/revenue', name: 'PlatformRevenue', component, meta: { requiresAuth: true, requiresRole: 'super_admin' } },
  { path: '/admin', name: 'Admin', component, meta: { requiresAuth: true, requiresRole: 'admin' } },
  { path: '/my-learning', name: 'MyLearning', component, meta: { requiresAuth: true } },
  { path: '/careers/:organizationSlug', name: 'Careers', component },
  { path: '/admin/old', redirect: '/admin/revenue' },
  { path: '/buildings', component, meta: { requiresRole: 'admin', requiresAuth: true }, children: [{ path: 'schedule', name: 'BuildingsSchedule', component }] },
  { path: '/admin/new-tool', name: 'NewTool', component, meta: { requiresAuth: true, requiresRole: 'admin' } },
  { path: '/admin/record/:id', name: 'RecordDetail', component, meta: { requiresAuth: true } },
  { path: '/callback', name: 'Callback', component, meta: { requiresAuth: true } },
  { path: '/:pathMatch(.*)*', name: 'NotFound', component }
] });
const admin = { role: 'super_admin' };
const opts = { orgSlug: 'tisi', currentPath: '/tisi/admin/settings', agency: { id: 377 }, user: admin };
const pathEntry = path => ({ kind: 'path', path });

describe('registered Quick Nav destinations', () => {
  it('preserves dashboard tabs when invoked from settings', () => {
    const result = resolveRegisteredQuickNav({ kind: 'dashboard', tab: 'my', my: 'payroll' }, router, opts);
    expect(result.fullPath).toBe('/tisi/dashboard?tab=my&my=payroll');
  });
  it('never prefixes an already scoped path twice', () => {
    expect(resolveRegisteredQuickNav(pathEntry('/tisi/admin/clients'), router, opts).path).toBe('/tisi/admin/clients');
  });
  it('preserves explicit queries, repeated parameters, and anchor destinations', () => {
    const result = resolveRegisteredQuickNav({ ...pathEntry('/dashboard?tag=a&tag=b'), query: { tab: 'my' }, hash: '#billing' }, router, opts);
    expect(result.query).toEqual({ tab: 'my', tag: ['a', 'b'] });
    expect(result.hash).toBe('#billing');
  });
  it('resolves named routes and flat-only routes from a tenant', () => {
    expect(resolveRegisteredQuickNav({ kind: 'route', routeName: 'MyLearning', query: { filter: 'saved' }, hash: '#courses' }, router, opts).fullPath).toBe('/my-learning?filter=saved#courses');
    expect(resolveRegisteredQuickNav(pathEntry('/admin/revenue'), router, opts).path).toBe('/admin/revenue');
  });
  it('keeps platform actions and public agency pages in their correct scope', () => {
    expect(resolveRegisteredQuickNav({ ...pathEntry('/admin?panel=overview'), scope: 'platform' }, router, opts).fullPath).toBe('/admin?panel=overview');
    expect(resolveRegisteredQuickNav({ ...pathEntry('/careers'), publicPath: 'careers' }, router, opts).path).toBe('/careers/tisi');
  });
  it('rejects not-found routes, missing parameters and external destinations', () => {
    expect(resolveRegisteredQuickNav(pathEntry('/admin/removed'), router, opts)).toBeNull();
    expect(resolveRegisteredQuickNav({ routeName: 'RecordDetail' }, router, opts)).toBeNull();
    expect(resolveRegisteredQuickNav(pathEntry('//example.com'), router, opts)).toBeNull();
  });
  it('validates redirect destinations and inherited parent permissions', () => {
    const redirect = resolveRegisteredQuickNav(pathEntry('/admin/old'), router, opts);
    expect(redirect.path).toBe('/admin/revenue');
    expect(canDiscoverQuickNavRoute(redirect, { user: { role: 'staff' } })).toBe(false);
    expect(canDiscoverQuickNavRoute(router.resolve('/buildings/schedule'), { user: { role: 'provider' } })).toBe(false);
  });
  it('discovers new static pages automatically, with role gates, excluding record details and callbacks', () => {
    const entries = getRegisteredQuickNavEntries(router, buildQuickNavContext({ user: admin }), opts);
    expect(entries.some(e => e.path === '/admin/new-tool')).toBe(true);
    expect(entries.some(e => /callback|record\/:id/.test(e.path))).toBe(false);
    const staffEntries = getRegisteredQuickNavEntries(router, buildQuickNavContext({ user: { role: 'staff' } }), opts);
    expect(staffEntries.some(e => e.path === '/admin/new-tool' || e.path === '/admin/revenue')).toBe(false);
  });
  it('keeps same-page tab shortcuts searchable and includes Finance Operations', () => {
    const ctx = buildQuickNavContext({ user: admin });
    expect(getAllQuickNavEntries(ctx).some(e => e.path?.includes('tab=coverage-needs'))).toBe(true);
    expect(searchQuickNav('bank', ctx).flat.some(e => e.path === '/finance-operations?area=bank')).toBe(true);
    expect(searchQuickNav('stripe', ctx).flat.some(e => e.path === '/admin/family-billing?tab=setup')).toBe(true);
  });
});

function resolved(meta, path = '/admin/tool', name = 'Tool', query = {}) {
  return { path, name, query, params: {}, matched: [{ path }], meta: { requiresAuth: true, ...meta } };
}
describe('Quick Nav access filtering', () => {
  it('allows delegated billers into the workspace while excluding clinical providers', () => {
    const route = resolved({ requiresBillingWorkspace: true });
    const user = { role: 'staff', billingAgencyIds: [377] };
    expect(canDiscoverQuickNavRoute(route, { user, agency: { id: 377 } })).toBe(true);
    expect(canDiscoverQuickNavRoute(route, { user, agency: { id: 500 } })).toBe(true);
    expect(canDiscoverQuickNavRoute(route, { user: { role: 'provider', billingAgencyIds: [377] }, agency: { id: 377 } })).toBe(false);
  });
  it('enforces capabilities and school feature provisioning', () => {
    expect(canDiscoverQuickNavRoute(resolved({ requiresCapability: 'canManagePayroll' }), { user: { role: 'staff', capabilities: { canManagePayroll: false } } })).toBe(false);
    const school = resolved({ requiresRole: 'admin' }, '/admin/school-portals', 'SchoolPortals');
    expect(canDiscoverQuickNavRoute(school, { user: { role: 'admin' }, agency: { feature_flags: {} } })).toBe(false);
    expect(canDiscoverQuickNavRoute(school, { user: { role: 'admin' }, agency: { feature_flags: { schoolPortalsEnabled: true } } })).toBe(true);
  });
  it('honors restricted support and supervisor destinations', () => {
    expect(canDiscoverQuickNavRoute(resolved({ requiresRole: 'admin' }, '/tisi/admin/audit-center'), { user: { role: 'support' } })).toBe(false);
    expect(canDiscoverQuickNavRoute(resolved({ requiresRole: 'clinical_practice_assistant' }, '/tisi/admin/settings'), { user: { role: 'provider_plus' } })).toBe(false);
  });
  it('allows coordinator exceptions without widening access to other pages', () => {
    const user = { role: 'provider', has_skill_builder_coordinator_access: true };
    expect(canDiscoverQuickNavRoute(resolved({ requiresRole: 'admin', allowSubCoordinator: true }), { user })).toBe(true);
    expect(canDiscoverQuickNavRoute(resolved({ requiresRole: 'admin' }), { user })).toBe(false);
  });
});
