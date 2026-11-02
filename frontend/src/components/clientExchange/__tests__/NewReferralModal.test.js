import { beforeEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: mocks }));
import Modal from '../NewReferralModal.vue';
import ExchangeRequiredFields from '../ExchangeRequiredFields.vue';
import ClientSchedulePreferences from '../ClientSchedulePreferences.vue';
const make = () => {const wrapper=shallowMount(Modal, { props: { agencyId: 2 }, global: {stubs: {ExchangeRequiredFields:false,ClientSchedulePreferences:false}} });Object.assign(wrapper.vm.$.setupState.form,{age:'9',gender:'unknown',modality:'virtual',insurance:'Medicaid',presentingProblem:'Worry',schedule:{days:['Monday'],periods:['morning']}});return wrapper;};
beforeEach(() => { vi.clearAllMocks(); mocks.post.mockImplementation(async url => ({ data: url === '/client-exchange/referrals' ? { clientId: 15, taskId: 30 } : { listing: { id: 20 } } })); });
it('posts a minimal client referral without requiring demographic or clinical pastes', async () => {
  const wrapper = make(); const state = wrapper.vm.$.setupState;
  const licenseChoices=wrapper.findAll('select').flatMap(select=>select.findAll('option')).filter(option=>['licensed_or_provisional','independent'].includes(option.attributes('value')));
  expect(licenseChoices.map(option=>option.attributes('value'))).toEqual(['licensed_or_provisional','independent']);
  expect(licenseChoices[0].text()).toContain('includes provisional licenses');
  Object.assign(state.form, { initials: 'AB', age: '9', gender: 'female', diagnoses: 'F41.1', providerGender: 'female', providerQualification:'independent' });
  await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(mocks.post).toHaveBeenCalledWith('/client-exchange/referrals', expect.objectContaining({ initials: 'AB', age: '9', providerGender: 'female', providerQualification:'independent', requestId: expect.any(String) }));
  expect(mocks.post).toHaveBeenCalledWith('/client-exchange/listings', { agencyId: 2, clientId: 15 });
  expect(wrapper.emitted('posted')).toHaveLength(1); wrapper.unmount();
});
it('imports optional pasted records before posting and reuses the saved client on retry', async () => {
  const wrapper = make(); const state = wrapper.vm.$.setupState;
  state.form.initials = 'AB'; state.records.intake = 'Presenting problem: Worry';
  await state.submit(); await flushPromises();
  expect(state.showImport).toBe(true); expect(mocks.post.mock.calls.some(([url]) => url.endsWith('/listings'))).toBe(false);
  mocks.post.mockRejectedValueOnce(new Error('Temporary failure'));
  await state.onImported(); await flushPromises();
  expect(state.clientId).toBe(15); expect(wrapper.emitted('posted')).toBeUndefined();
  await state.submit(); await flushPromises();
  expect(mocks.post.mock.calls.filter(([url]) => url === '/client-exchange/referrals')).toHaveLength(1);
  expect(wrapper.emitted('posted')).toHaveLength(1); wrapper.unmount();
});
it('uses the same request key if the create response is lost', async () => {
  const wrapper = make(); const state = wrapper.vm.$.setupState; state.form.initials = 'AB';
  mocks.post.mockRejectedValueOnce(new Error('Response lost')); await state.submit(); await state.submit(); await flushPromises();
  const calls = mocks.post.mock.calls.filter(([url]) => url === '/client-exchange/referrals');
  expect(calls[0][1].requestId).toBe(calls[1][1].requestId); wrapper.unmount();
});
it('sends the same profile taxonomy choices when creating a minimal referral',async()=>{
 const wrapper=make(),state=wrapper.vm.$.setupState;state.form.initials='AB';state.form.matchingPreferences={specialties:['Mood Disorders'],populations:['Veterans'],modalities:['EMDR']};await state.submit();await flushPromises();
 expect(mocks.post).toHaveBeenCalledWith('/client-exchange/referrals',expect.objectContaining({matchingPreferences:state.form.matchingPreferences}));wrapper.unmount();
});

it('requires essentials for a manual referral while diagnoses and gender remain optional',async()=>{const wrapper=make();const state=wrapper.vm.$.setupState;state.form.initials='AB';state.form.insurance='';await state.submit();expect(mocks.post).not.toHaveBeenCalled();expect(wrapper.text()).toContain('insurance plan');state.form.insurance='Medicaid';await state.submit();expect(wrapper.emitted('posted')).toHaveLength(1);wrapper.unmount();});

it('points to the missing time when notes say After 3pm and preserves entered details',async()=>{
 const wrapper=make(),state=wrapper.vm.$.setupState;state.form.initials='AB';
 state.form.schedule={days:['Monday','Tuesday'],periods:[],windows:[],notes:'After 3pm',timezone:'America/Denver'};
 await wrapper.find('form').trigger('submit');await flushPromises();
 expect(mocks.post).not.toHaveBeenCalled();expect(wrapper.find('[role="alert"]').text()).toContain('Scheduling notes alone');
 expect(wrapper.find('[data-exchange-field="times"]').attributes('aria-invalid')).toBe('true');
 expect(state.form.schedule.notes).toBe('After 3pm');
 await wrapper.find('[data-exchange-field="times"] input').setValue(true);
 await wrapper.find('form').trigger('submit');await flushPromises();
 expect(wrapper.emitted('posted')).toHaveLength(1);expect(mocks.post).toHaveBeenCalledWith('/client-exchange/referrals',expect.objectContaining({schedule:expect.objectContaining({notes:'After 3pm'})}));wrapper.unmount();
});
it('requires initials, age and client gender while full name and therapist preference stay optional',async()=>{
 const wrapper=make(),state=wrapper.vm.$.setupState;Object.assign(state.form,{initials:'',age:'',gender:''});
 await state.submit();await flushPromises();expect(mocks.post).not.toHaveBeenCalled();
 expect(wrapper.findComponent(ExchangeRequiredFields).props('missing').map(f=>f.key)).toEqual(['initials','age','gender']);
 Object.assign(state.form,{initials:'AB',age:'0',gender:'unknown'});await state.submit();await flushPromises();
 expect(wrapper.emitted('posted')).toHaveLength(1);wrapper.unmount();
});
