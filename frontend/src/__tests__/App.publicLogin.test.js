import { beforeEach, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';

const state = vi.hoisted(() => ({ auth: null, route: null, workspaceMounted: vi.fn() }));
vi.mock('../store/auth', () => ({ useAuthStore: () => state.auth }));
vi.mock('vue-router', () => ({ useRoute: () => state.route }));
vi.mock('../AppWorkspace.vue', () => ({ __esModule: true, default: {
  setup() { state.workspaceMounted(); },
  template: '<main>Employee workspace</main>'
} }));
import App from '../App.vue';

beforeEach(() => {
  vi.clearAllMocks();
  state.auth = reactive({ user: null, isAuthenticated: false });
  state.route = reactive({ name: 'Login', meta: {} });
});
const render = () => mount(App, { global: { stubs: {
  RouterView: { template: '<form aria-label="Sign in"><input name="username" /></form>' },
  AssistantAppShell: { template: '<aside>Assistant workspace<slot /></aside>' }
} } });

it.each(['Login', 'OrganizationLogin', 'ParentOrganizationLogin', 'SchoolCareBridgeLogin', 'SchoolCareBridgeSchool'])(
  'renders anonymous %s without mounting employee widgets', async name => {
    state.route.name = name;
    const wrapper = render();
    try {
      await flushPromises();
      expect(wrapper.get('form[aria-label="Sign in"] input').attributes('name')).toBe('username');
      expect(state.workspaceMounted).not.toHaveBeenCalled();
      expect(wrapper.text()).not.toContain('Employee workspace');
    } finally { wrapper.unmount(); }
  }
);
it('loads the ordinary workspace after successful authentication and navigation', async () => {
  const wrapper = render();
  try {
    await flushPromises();
    expect(state.workspaceMounted).not.toHaveBeenCalled();
    state.auth.user = { id: 8, role: 'admin' }; state.auth.isAuthenticated = true;
    state.route.name = 'Dashboard';
    await flushPromises();
    expect(state.workspaceMounted).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Employee workspace');
  } finally { wrapper.unmount(); }
});
it('retains the assistant shell boundary even on a login-named route', async () => {
  state.auth.user = { id: 9, role: 'assistant' }; state.auth.isAuthenticated = true;
  const wrapper = render();
  try {
    await flushPromises();
    expect(wrapper.text()).toContain('Assistant workspace');
    expect(state.workspaceMounted).not.toHaveBeenCalled();
  } finally { wrapper.unmount(); }
});
