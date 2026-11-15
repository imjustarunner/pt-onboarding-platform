import { afterEach, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { ref } from 'vue';
import Dashboard from '../UserAccountDashboard.vue';
import { USER_ACCOUNT_CONTEXT_KEY } from '../../../../composables/userAccountContext.js';

vi.mock('vue-router', () => ({ useRoute: () => ({ params: {}, query: {} }), useRouter: () => ({}) }));
let wrapper;
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); });

async function mountAccount(canEditUser) {
  const context = {
    userId: ref(42), agencyId: ref(2), user: ref({ id: 42, role: 'provider' }),
    accountForm: ref({ firstName: 'Alex', role: 'provider' }), canEditUser: ref(canEditUser),
    api: { get: vi.fn(async () => ({ data: [] })) },
    triggerPhotoUpload: vi.fn(), navigate: vi.fn()
  };
  wrapper = shallowMount(Dashboard, { global: {
    provide: { [USER_ACCOUNT_CONTEXT_KEY]: context },
    stubs: { AccountDashboardCard: { props: ['sectionId'], template: '<section :id="sectionId"><slot /></section>' } }
  } });
  await flushPromises();
  return context;
}

it('keeps account actions relevant and opens contact fields for editing', async () => {
  const context = await mountAccount(true);
  const actions = wrapper.find('.acct-sidebar-block');
  expect(actions.text()).toContain('Account quick actions');
  expect(actions.text()).not.toMatch(/Log Time|Upload Document|Send Message/);
  expect(wrapper.find('#account-info input').exists()).toBe(false);
  await actions.findAll('button')[0].trigger('click');
  expect(wrapper.find('#account-info input').element.value).toBe('Alex');
  await actions.findAll('button')[2].trigger('click');
  expect(context.triggerPhotoUpload).toHaveBeenCalledOnce();
  expect(context.navigate).not.toHaveBeenCalled();
});

it('offers viewing actions without edit controls to read-only staff', async () => {
  await mountAccount(false);
  const actions = wrapper.find('.acct-sidebar-block');
  expect(actions.text()).toContain('Contact details');
  expect(actions.text()).not.toContain('Edit contact details');
  expect(actions.text()).not.toContain('Update profile photo');
  await actions.findAll('button')[0].trigger('click');
  expect(wrapper.find('#account-info input').exists()).toBe(false);
});
