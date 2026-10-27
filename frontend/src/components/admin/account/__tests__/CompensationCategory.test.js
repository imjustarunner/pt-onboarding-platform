import { expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import Dashboard from '../UserAccountDashboard.vue';
import { USER_ACCOUNT_CONTEXT_KEY } from '../../../../composables/userAccountContext';
vi.mock('vue-router', () => ({ useRoute: () => ({params:{},query:{}}), useRouter:()=>({}) }));
it('loads object category labels, seeds category/level, and saves the edited assignment', async () => {
  const api = { get: vi.fn(async url => ({ data: url.includes('/users/42/compensation-level') ? {assignment:{category:2,level:1,bypass:'0'}} : url === '/payroll/compensation-levels' ? {levels:[],categoryLabels:{1:'Unlicensed',2:'Pre-licensed',3:'Licensed'}} : [] })), post: vi.fn(async (_url, body) => ({data:{assignment:body}})) };
  const w = shallowMount(Dashboard, { global: { provide: { [USER_ACCOUNT_CONTEXT_KEY]: {api,userId:ref(42),agencyId:ref(2),user:ref({id:42,role:'provider'}),accountForm:ref({role:'provider'}),canEditUser:ref(true)} }, stubs:{AccountDashboardCard:{template:'<section><slot /></section>'}} } });
  await flushPromises();
  expect(w.text()).not.toContain('Failed to load compensation level');
  const selects = w.findAll('.comp-select'); expect(selects[0].element.value).toBe('2'); expect(selects[1].element.value).toBe('1');
  await selects[0].setValue('3'); await selects[1].setValue('2');
  await w.findAll('button').find(b=>b.text().includes('Save Assignment')).trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/payroll/users/42/compensation-level', {agencyId:2,category:3,level:2,bypass:false,applyRates:false}); w.unmount();
});
