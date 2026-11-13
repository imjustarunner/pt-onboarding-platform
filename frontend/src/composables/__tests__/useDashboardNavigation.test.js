import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import { useDashboardNavigation } from '../useDashboardNavigation.js';
import { clearDashboardMobileNavItems, dashboardNavigationContextKey, setDashboardMobileNavItems } from '../../navigation/dashboardMobileNav.js';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get } }));
let wrapper;
const provider = { id: 7, role: 'provider', status: 'ACTIVE_EMPLOYEE', capabilities: { canViewLibrary: true } };
const agency = { id: 2, slug: 'example', organization_type: 'agency', feature_flags: {} };
function start(overrides = {}) {
  const state = {
    user: ref({ ...provider }), agency: ref({ ...agency }), organizations: ref([]),
    dashboardTo: ref('/example/dashboard'), momentumListEnabled: ref(true), enabled: ref(true),
    brandingStore: {
      platformBranding: {}, dashboardIconOrganization: agency,
      getDashboardCardIconUrl: id => `/icons/${id}.svg`,
      getAdminQuickActionIconUrl: id => `/icons/${id}.svg`,
      getDashboardIconOverrideUrl: (_section, id) => id === 'my' ? '/custom/account.svg' : null
    }, ...overrides
  };
  let navigation;
  wrapper = mount({ setup() { navigation = useDashboardNavigation(state); return () => null; } });
  return { ...state, ...navigation };
}
const labels = navigation => navigation.items.value.map(card => card.label);
const card = (navigation, id) => navigation.items.value.find(item => item.id === id);
beforeEach(() => {
  localStorage.clear(); clearDashboardMobileNavItems(); get.mockReset();
  get.mockResolvedValue({ data: {} });
});
afterEach(() => { wrapper?.unmount(); clearDashboardMobileNavItems(); });

describe('dashboard navigation before a dashboard visit', () => {
  it('immediately includes the full authorized menu, icons, and nested destinations', async () => {
    const nav = start();
    expect(labels(nav)).toEqual(expect.arrayContaining([
      'Overview', 'My Account', 'My Schedule', 'My Work', 'My Meetings', 'Note Workspace',
      'Messages', 'Submit', 'Tools and Resources', 'Notifications', 'My Training', 'My Clients', 'Staff', 'Schools & Programs'
    ]));
    expect(card(nav, 'my').iconUrl).toBe('/custom/account.svg');
    const library = card(nav, 'tools_nest').children.find(item => item.id === 'tools_library');
    expect(library.children.find(item => item.id === 'library_mine').to).toBe('/example/library?section=mine');
    expect(card(nav, 'momentum_nest').children.find(item => item.id === 'tasks_hub').to).toBe('/example/tasks');
    await flushPromises();
    expect(get.mock.calls.some(([url]) => /onboarding-checklist|schedule-summary|work-queue/.test(url))).toBe(false);
  });

  it('restores saved order and keeps the full menu if metadata requests fail', async () => {
    localStorage.setItem('dashboard.railOrder.v1:7', JSON.stringify(['training', 'tools_nest']));
    get.mockRejectedValue(new Error('offline'));
    const nav = start(); await flushPromises();
    expect(nav.items.value.slice(0, 2).map(item => item.id)).toEqual(['training', 'tools_nest']);
    expect(labels(nav)).toContain('My Clients');
  });

  it('loads server order, assigned portals, and supervision without mounting dashboard panels', async () => {
    get.mockImplementation(async url => ({ data: url.endsWith('/preferences')
      ? { dashboard_rail_order_json: ['staff', 'my'] }
      : url.endsWith('/my-history-status') ? { hasClinicalSupervision: true } : {} }));
    const nav = start({ organizations: ref([{ id: 4, slug: 'school', organization_type: 'school', portal_short_title: 'My School' }]) });
    await flushPromises();
    expect(nav.items.value[0].id).toBe('staff');
    expect(labels(nav)).toContain('My Supervision');
    expect(card(nav, 'portals_nest').children.find(item => item.id === 'portal_org_4').to).toBe('/school/dashboard');
  });

  it('uses the live rail and rebuilds immediately when the user, permissions, or route scope changes', async () => {
    const nav = start();
    setDashboardMobileNavItems([{ id: 'live', label: 'Live rail' }], nav.contextKey.value);
    expect(labels(nav)).toEqual(['Live rail']);
    nav.dashboardTo.value = '/other/dashboard';
    nav.agency.value = { ...agency, id: 3, slug: 'other' };
    expect(labels(nav)).toContain('My Schedule');
    expect(card(nav, 'tools_nest').children.find(item => item.id === 'tools_library').to).toBe('/other/library');
    nav.user.value = { id: 8, role: 'staff', status: 'ACTIVE_EMPLOYEE', capabilities: { canManagePayroll: true } };
    expect(labels(nav)).not.toContain('My Clients');
    expect(card(nav, 'tools_nest').children.some(item => item.id === 'tools_library')).toBe(false);
    await flushPromises();
  });

  it('ignores late replies for the previous user and agency', async () => {
    let resolveOldOrder;
    get.mockImplementation(url => url === '/users/7/preferences'
      ? new Promise(resolve => { resolveOldOrder = resolve; }) : Promise.resolve({ data: {} }));
    const nav = start();
    nav.user.value = { ...provider, id: 8 };
    nav.agency.value = { ...agency, id: 3 };
    nav.dashboardTo.value = '/other/dashboard';
    await flushPromises();
    resolveOldOrder({ data: { dashboard_rail_order_json: ['staff'] } });
    await flushPromises();
    expect(nav.items.value[0].id).toBe('overview');
    expect(card(nav, 'documentation_hub').to).toBe('/other/note-aid');
  });

  it('keeps prehire and employee-portal restrictions on cold entry', async () => {
    const nav = start({ user: ref({ ...provider, status: 'PREHIRE_OPEN' }) });
    expect(labels(nav).sort()).toEqual(['Documents', 'My Work']);
    nav.user.value = { ...provider };
    nav.agency.value = { ...agency, feature_flags: { portalVariant: 'employee', noteAidEnabled: false } };
    await flushPromises();
    expect(labels(nav)).not.toContain('Submit');
    expect(labels(nav)).toContain('My Account');
    nav.enabled.value = false;
    expect(nav.items.value).toEqual([]);
  });

  it('never exposes metadata from the previous tenant, even before watchers flush', async () => {
    get.mockImplementation(async url => ({ data: url.includes('/skill-builders/options')
      ? { organizations: [{ id: 99, name: 'Previous tenant program', organizationType: 'program' }] } : {} }));
    const nav = start({ user: ref({ ...provider, role: 'super_admin' }) });
    await flushPromises();
    expect(card(nav, 'portals_nest').children.some(item => item.id === 'sub_coord_program_99')).toBe(true);
    nav.agency.value = { ...agency, id: 3 };
    nav.dashboardTo.value = '/other/dashboard';
    expect(card(nav, 'portals_nest').children.some(item => item.id === 'sub_coord_program_99')).toBe(false);
  });

  it('retains capability-based supervision access for staff when history is empty', async () => {
    get.mockResolvedValue({ data: { hasClinicalSupervision: false } });
    const nav = start({ user: ref({ ...provider, role: 'staff', capabilities: { hasClinicalSupervision: true } }) });
    await flushPromises();
    expect(labels(nav)).toContain('My Supervision');
    expect(get).toHaveBeenCalledWith('/supervision/my-history-status', expect.any(Object));
  });

  it('keeps context stable across capability key ordering and invalidates feature and path changes', () => {
    const user = { ...provider, capabilities: { canViewLibrary: true, canViewTraining: true } };
    const context = dashboardNavigationContextKey(user, 2, '/example/dashboard', agency);
    expect(dashboardNavigationContextKey({ ...user, capabilities: { canViewTraining: true, canViewLibrary: true } }, 2, '/example/dashboard', agency)).toBe(context);
    expect(dashboardNavigationContextKey(user, 2, '/dashboard', agency)).not.toBe(context);
    expect(dashboardNavigationContextKey(user, 2, '/example/dashboard', { ...agency, feature_flags: { noteAidEnabled: false } })).not.toBe(context);
  });
});

it('uses the selected NLU agency for the cold-entry menu and preserves own pay',async()=>{
 const nav=start({user:ref({...provider,workspaceServiceContext:{agencyId:453,canTutor:true,learningOnly:true}}),agency:ref({id:453,slug:'nlu-qa-demo',feature_flags:{qaSandbox:{program:'tutoring'}}}),dashboardTo:ref('/nlu-qa-demo/dashboard')});
 await flushPromises();expect(labels(nav)).toContain('My students');
 expect(labels(nav)).not.toContain('My Clients');expect(labels(nav)).not.toContain('Note Workspace');expect(labels(nav)).not.toContain('Staff');
 expect(labels(nav)).toContain('My Account');expect(card(nav,'clients').to).toBe('/nlu-qa-demo/students');
});

it('loads service permissions on a cold schedule entry and discards the clinical menu',async()=>{
 get.mockImplementation(async url=>({data:url==='/tutoring-workspace/context'?{agencyId:453,canTutor:true,canClinical:false,learningOnly:true}:{}}));
 const nav=start({user:ref({...provider}),agency:ref({id:453,slug:'nlu-qa-demo'}),dashboardTo:ref('/nlu-qa-demo/dashboard')});
 await flushPromises();expect(labels(nav)).toContain('My students');expect(labels(nav)).not.toContain('My Clients');expect(labels(nav)).not.toContain('Note Workspace');
});

it('reloads service permissions when a concurrent user refresh replaces the same identity',async()=>{
 const pending=[];
 get.mockImplementation(url=>url==='/tutoring-workspace/context'
   ?new Promise(resolve=>pending.push(resolve)):Promise.resolve({data:{}}));
 const nav=start({user:ref({...provider}),agency:ref({id:453,slug:'nlu-qa-demo'}),dashboardTo:ref('/nlu-qa-demo/dashboard')});
 await flushPromises();expect(pending).toHaveLength(1);
 nav.user.value={...provider};
 await flushPromises();expect(pending).toHaveLength(2);
 pending[0]({data:{agencyId:453,canTutor:false,canClinical:true}});
 pending[1]({data:{agencyId:453,canTutor:true,canClinical:false,learningOnly:true}});
 await flushPromises();
 expect(labels(nav)).toContain('My students');
 expect(labels(nav)).toContain('Tutoring profile');
 expect(labels(nav)).not.toContain('Note Workspace');
});
