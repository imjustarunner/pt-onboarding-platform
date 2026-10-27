import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: mocks }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 7 } }) }));
import Modal from '../PostListingModal.vue';
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue({ data: { summary: { diagnoses: ['F41.1 — Anxiety'], presentingProblems: ['Worry'] } } }); mocks.post.mockResolvedValue({ data: { listing: { id: 1, notifications: { sent: 1 } } } }); });
it('posts the preset client directly from the profile', async () => {
  const wrapper = mount(Modal, { props: { agencyId: 2, presetClientId: 4, lockClient: true } });
  await flushPromises(); await wrapper.find('.btn-primary').trigger('click'); await flushPromises();
  expect(mocks.get).toHaveBeenCalledWith('/client-exchange/clients/4/summary', { params: { agencyId: 2 } });
  expect(wrapper.text()).toContain('F41.1 — Anxiety');
  expect(wrapper.text()).toContain('Worry');
  expect(mocks.post).toHaveBeenCalledWith('/client-exchange/listings', expect.objectContaining({ agencyId: 2, clientId: 4 }));
  expect(wrapper.emitted('posted')).toHaveLength(1);
});
it('keeps a saved listing from being reposted when mail delivery fails', async () => {
  mocks.post.mockResolvedValue({ data: { listing: { id: 1, notifications: { failed: 1 } } } });
  const wrapper = mount(Modal, { props: { agencyId: 2, presetClientId: 4, lockClient: true } });
  await flushPromises(); await wrapper.find('.btn-primary').trigger('click'); await flushPromises();
  expect(wrapper.text()).toContain('Client posted, but some matching emails could not be sent');
  expect(wrapper.find('.btn-primary').attributes('disabled')).toBeDefined();
  await wrapper.find('.modal-actions .btn-secondary').trigger('click'); expect(wrapper.emitted('posted')).toHaveLength(1);
});
it('loads school and office clients assigned to a provider, accepting paginated responses', async () => {
  mocks.get.mockResolvedValue({ data: { items: [{ id: 4, initials: 'AB', client_type: 'school' }] } });
  const wrapper = mount(Modal, { props: { agencyId: 2 } }); await flushPromises();
  expect(mocks.get).toHaveBeenCalledWith('/clients', { params: { agency_id: 2, provider_id: 7, client_type: 'clinical,learning,basic_nonclinical,school' } });
  expect(wrapper.text()).toContain('AB');
});
it('prefills saved scheduling needs and posts changed days and times with the referral', async () => {
  mocks.get.mockResolvedValue({ data: { summary: { preferences: { schedule: { days: ['Monday'], periods: ['after_school'], windows: [], timezone: 'America/Denver' } } } } });
  const wrapper = mount(Modal, { props: { agencyId: 2, presetClientId: 4, lockClient: true } }); await flushPromises();
  const editor = wrapper.findComponent({ name: 'ClientSchedulePreferences' });
  expect(editor.props('modelValue').days).toEqual(['Monday']);
  editor.vm.$emit('update:modelValue', { days: ['Friday'], periods: ['pm'], windows: [{ day: 'Friday', start: '16:00', end: '18:00' }], timezone: 'America/Denver' });
  await wrapper.find('.btn-primary').trigger('click'); await flushPromises();
  expect(mocks.post).toHaveBeenCalledWith('/client-exchange/listings', expect.objectContaining({ preferences: expect.objectContaining({ schedule: expect.objectContaining({ days: ['Friday'], windows: [{ day: 'Friday', start: '16:00', end: '18:00' }] }) }) }));
  wrapper.unmount();
});
it('keeps invalid time ranges from being posted', async () => {
  const wrapper = mount(Modal, { props: { agencyId: 2, presetClientId: 4, lockClient: true } }); await flushPromises();
  wrapper.findComponent({ name: 'ClientSchedulePreferences' }).vm.$emit('update:modelValue', { windows: [{ start: '18:00', end: '16:00' }], timezone: 'America/Denver' });
  await wrapper.find('.btn-primary').trigger('click'); await flushPromises();
  expect(mocks.post).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('End time must be later'); wrapper.unmount();
});
it('prefills client fit selections and includes edits in the posted referral',async()=>{
 const saved={specialties:['Depression'],populations:['Veterans']};mocks.get.mockResolvedValue({data:{summary:{preferences:{matchingPreferences:saved}}}});
 const wrapper=mount(Modal,{props:{agencyId:2,presetClientId:4,lockClient:true}});await flushPromises();
 const editor=wrapper.findComponent({name:'ClientMatchingPreferences'});expect(editor.props('modelValue')).toEqual(saved);expect(editor.props('maxSelections')).toBe(0);
 const edited={...saved,modalities:['EMDR']};editor.vm.$emit('update:modelValue',edited);await wrapper.find('.btn-primary').trigger('click');await flushPromises();
 expect(mocks.post).toHaveBeenCalledWith('/client-exchange/listings',expect.objectContaining({preferences:expect.objectContaining({matchingPreferences:edited})}));wrapper.unmount();
});
it('keeps duplicate referral edits visible and clearly says they were not saved', async () => {
  mocks.post.mockResolvedValue({ data: { listing: { id: 12, alreadyPosted: true, notes: 'Original notes' } } });
  const wrapper = mount(Modal, { props: { agencyId: 450, presetClientId: 2264, lockClient: true } });
  await flushPromises();
  await wrapper.find('textarea[placeholder^="Why"]').setValue('New notes');
  await wrapper.find('.btn-primary').trigger('click'); await flushPromises();
  expect(wrapper.text()).toContain('Referral #12 already exists');
  expect(wrapper.text()).toContain('Your new notes and preferences were not saved');
  expect(wrapper.find('textarea[placeholder^="Why"]').element.value).toBe('New notes');
  expect(wrapper.emitted('posted')).toBeUndefined();
  expect(wrapper.find('.btn-primary').attributes('disabled')).toBeDefined();
  await wrapper.find('.modal-actions .btn-secondary').trigger('click');
  expect(wrapper.emitted('posted')[0][0]).toMatchObject({ id: 12, alreadyPosted: true });
  expect(mocks.post).toHaveBeenCalledTimes(1);
  wrapper.unmount();
});
