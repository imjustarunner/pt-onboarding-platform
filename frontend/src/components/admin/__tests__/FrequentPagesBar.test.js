import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import FrequentPagesBar from '../FrequentPagesBar.vue';

const state = vi.hoisted(() => ({ shortcuts: [] }));
vi.mock('../../../composables/useNavShortcuts.js', () => ({
  useNavShortcuts: () => ({ topShortcuts: state.shortcuts })
}));

async function renderAt(path, savedPath) {
  state.shortcuts = [{ label: 'Users', path: savedPath, canonicalKey: 'users', visitCount: 9 }];
  const component = { template: '<div />' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/:rest(.*)*', component, meta: { requiresAuth: true } },
      { path: '/dashboard', component, meta: { requiresAuth: true } },
      { path: '/:organizationSlug/admin/:rest(.*)*', component, meta: { requiresAuth: true, organizationSlug: true } },
      { path: '/:organizationSlug/dashboard', component, meta: { requiresAuth: true, organizationSlug: true } },
      { path: '/login', component }
    ]
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(FrequentPagesBar, { global: { plugins: [router] } });
  return { wrapper, router };
}

describe('Frequent pages workspace navigation', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['itsco', 'nextleveluplcc', 'plottwistco'])('keeps %s when a saved Users link points to another workspace', async (slug) => {
    const { wrapper, router } = await renderAt(`/${slug}/dashboard`, '/another-tenant/admin/users?status=active#directory');
    expect(wrapper.get('a').attributes('href')).toBe(`/${slug}/admin/users?status=active#directory`);
    await wrapper.get('a').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.params.organizationSlug).toBe(slug);
    wrapper.unmount();
  });

  it('adds the current tenant to a saved flat Users link', async () => {
    const { wrapper } = await renderAt('/itsco/dashboard', '/admin/users');
    expect(wrapper.get('a').attributes('href')).toBe('/itsco/admin/users');
    wrapper.unmount();
  });

  it('keeps dedicated-host and platform routes flat instead of replaying a tenant switch', async () => {
    const { wrapper, router } = await renderAt('/dashboard', '/plottwistco/admin/users');
    expect(wrapper.get('a').attributes('href')).toBe('/admin/users');
    await wrapper.get('a').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.params.organizationSlug).toBeUndefined();
    wrapper.unmount();
  });

  it('updates shortcuts when the active tenant changes without remounting', async () => {
    const { wrapper, router } = await renderAt('/itsco/dashboard', '/plottwistco/admin/users');
    await router.push('/nextleveluplcc/dashboard');
    await flushPromises();
    expect(wrapper.get('a').attributes('href')).toBe('/nextleveluplcc/admin/users');
    wrapper.unmount();
  });

  it('does not replay a Settings agency selector from visit history', async () => {
    const { wrapper } = await renderAt('/itsco/dashboard', '/admin/settings?agencyId=1&tab=branding');
    expect(wrapper.get('a').attributes('href')).toBe('/itsco/admin/settings?tab=branding');
    wrapper.unmount();
  });

  it.each([null, '//another.example/admin', '/login'])('uses the current workspace home for an invalid shortcut %s', async (path) => {
    const { wrapper } = await renderAt('/itsco/dashboard', path);
    expect(wrapper.get('a').attributes('href')).toBe('/itsco/admin');
    wrapper.unmount();
  });
});
