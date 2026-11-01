import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
const state = vi.hoisted(() => ({ role: 'provider', get: vi.fn(), patch: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 1439, role: state.role } }) }));
vi.mock('../../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 450, slug: 'demo' } }) }));
vi.mock('../../../../services/api', () => ({ default: { get: state.get, patch: state.patch } }));
vi.mock('../ClientChartAvatar.vue', () => ({ default: { template: '<span />' } }));
vi.mock('../TreatmentPlanAckPanel.vue', () => ({ default: { template: '<span />' } }));
import Panel from '../ClientTreatmentPlansPanel.vue';
beforeEach(() => {
  vi.clearAllMocks(); state.role = 'provider';
  const plan = { id: 51, status: 'active', title: 'Synthetic plan', created_by_user_id: 1439, goals: [{ id: 61, goal_index: 1, goal_text: 'Synthetic goal', status: 'active', objectives: [] }] };
  state.get.mockResolvedValue({ data: { plans: [plan], latestPlan: plan, events: [] } });
  state.patch.mockResolvedValue({ data: { changed: true, status: 'achieved', notifications: { sent: 1, needs_review: 1 } } });
});
it('requires an explicit progress save and reports transport acceptance separately from follow-up', async () => {
  const wrapper = mount(Panel, { props: { clientId: 2297, agencyId: 450, clientType: 'clinical' } }); await flushPromises();
  const select = wrapper.find('#goal-progress-61'); expect(select.exists()).toBe(true);
  await select.setValue('achieved'); expect(state.patch).not.toHaveBeenCalled();
  await wrapper.find('form.ctp-progress-controls').trigger('submit'); await flushPromises();
  expect(state.patch).toHaveBeenCalledWith('/medical-billing/treatment-plans/51/goals/61/progress', { agencyId: 450, clientId: 2297, status: 'achieved', expectedStatus: 'active' });
  expect(wrapper.text()).toContain('email(s) accepted for delivery'); expect(wrapper.text()).toContain('needs delivery follow-up'); expect(wrapper.text()).toContain('Achieved');
  await wrapper.find('form.ctp-progress-controls').trigger('submit'); await flushPromises(); expect(state.patch).toHaveBeenCalledOnce(); wrapper.unmount();
});
it('keeps clinical progress controls out of support and learning-plan views', async () => {
  for (const [role, clientType] of [['support', 'clinical'], ['provider', 'learning']]) {
    state.role = role; const wrapper = mount(Panel, { props: { clientId: 2297, agencyId: 450, clientType } }); await flushPromises();
    expect(wrapper.find('form.ctp-progress-controls').exists()).toBe(false); wrapper.unmount();
  }
});
