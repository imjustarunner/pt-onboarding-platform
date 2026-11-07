import { expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const state = vi.hoisted(() => {
  let finishImport, mounted;
  return {
    importing: new Promise(resolve => { finishImport = resolve; }),
    finishImport: () => finishImport(),
    mounted: new Promise(resolve => { mounted = resolve; }),
    onMount: () => mounted()
  };
});
vi.mock('../store/auth', () => ({ useAuthStore: () => ({ user: { id: 1434, role: 'support' }, isAuthenticated: true }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ name: 'OrganizationDashboard', meta: {} }) }));
vi.mock('../AppWorkspace.vue', async () => {
  await state.importing;
  return { __esModule: true, default: { setup: state.onMount, template: '<main>Ready workspace</main>' } };
});
import App from '../App.vue';

it('shows an explicit loading state while the private workspace files are pending, then removes it', async () => {
  const wrapper = mount(App, { global: { stubs: { RouterView: true } } });
  try {
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toBe('Opening your workspace…');
    expect(wrapper.text()).not.toContain('Ready workspace');
    state.finishImport();
    await state.mounted;
    await flushPromises();
    expect(wrapper.text()).toContain('Ready workspace');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  } finally { wrapper.unmount(); }
});
