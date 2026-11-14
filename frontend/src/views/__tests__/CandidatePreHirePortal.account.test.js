import { shallowMount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import Portal from '../CandidatePreHirePortalView.vue';
// Account readiness does not render PDFs; avoid loading PDF.js browser APIs in jsdom.
vi.mock('../../components/prehire/HireDocumentPreview.vue', () => ({ default: { template: '<div />' } }));
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/api', () => ({ default: api }));
vi.mock('axios', () => ({ default: { create: () => api } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { token: 'fixture' }, query: {} }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../composables/useOnboardingActivity.js', () => ({ useOnboardingActivity: () => ({}) }));
let state;
beforeEach(() => {
  vi.clearAllMocks();
  state = { candidate: { status: 'ONBOARDING', workEmail: 'staff@example.invalid', passwordFinalized: false, canFinalizeLogin: false }, agency: { name: 'Fixture' }, hireAccountMode: 'group_password', journey: {}, workflow: { supervisor: {} }, tasks: [] };
  api.get.mockImplementation(async url => ({ data: url.includes('suggestions') ? { suggestions: [] } : state }));
});
async function mountAccount() {
  const wrapper = shallowMount(Portal, { global: { stubs: { HirePortalWorkspace: { template: '<div><slot name="account" /></div>' } } } });
  await flushPromises();
  return wrapper;
}
it('explains prerequisites and hides password entry until all required onboarding is ready', async () => {
  const wrapper = await mountAccount();
  expect(wrapper.text()).toContain('Complete all required onboarding steps first');
  expect(wrapper.find('input[autocomplete="new-password"]').exists()).toBe(false);
  wrapper.unmount();
});
it('shows password preparation at the final step without claiming that it activates login', async () => {
  state.candidate.canFinalizeLogin = true;
  const wrapper = await mountAccount();
  expect(wrapper.findAll('input[autocomplete="new-password"]')).toHaveLength(2);
  expect(wrapper.text()).toContain('when People Operations activates');
  wrapper.unmount();
});
it('keeps submitted onboarding read-only while staff activation is pending', async () => {
  state.journey.onboardingCompletedAt = '2026-09-26';
  state.candidate.passwordFinalized = true;
  const wrapper = await mountAccount();
  expect(wrapper.text()).toContain('activate your account after onboarding review');
  expect(wrapper.find('input[autocomplete="new-password"]').exists()).toBe(false);
  wrapper.unmount();
});
it('keeps a candidate contract iframe, consent stage and unsaved values intact while its handbook modal is read',async()=>{
 state.agency={id:6,name:'Next Level Up'};state.tasks=[{id:7,title:'Employment agreement',taskType:'document',actionType:'signature',status:'pending',metadata:{contractGeneration:true}}];
 api.get.mockImplementation(async url=>({data:url.endsWith('/tasks/7')?{document:{htmlContent:'<p>Approved contract terms.</p>'},metadata:{contractGeneration:true},auditTrail:{portalConsent:{given:true}}}:state}));
 const wrapper=shallowMount(Portal,{attachTo:document.body,global:{stubs:{HirePortalWorkspace:{props:['data'],template:'<button class="open-contract" @click="$emit(\'document\',data.tasks[0])">Open agreement</button>'},ContractHandbookModal:{props:['open','sectionSlug'],template:'<div v-if="open" class="handbook-modal-test"><span>{{sectionSlug}}</span><button @click="$emit(\'close\')">Close</button></div>'}}}});
 await flushPromises();await wrapper.get('.open-contract').trigger('click');await flushPromises();const frame=wrapper.get('iframe.contract-html-preview').element;expect(frame.getAttribute('sandbox')).toBe('allow-scripts');wrapper.vm.$.setupState.fieldValues={answer:'Unfinished candidate answer'};
 window.dispatchEvent(new MessageEvent('message',{origin:'null',source:window,data:{type:'contract-handbook-reference',agencyId:6,sectionSlug:'testing-services',expectedVersionId:42}}));await flushPromises();expect(wrapper.find('.handbook-modal-test').exists()).toBe(false);
 window.dispatchEvent(new MessageEvent('message',{origin:'null',source:frame.contentWindow,data:{type:'contract-handbook-reference',agencyId:6,sectionSlug:'testing-services',expectedVersionId:42}}));await flushPromises();expect(wrapper.get('.handbook-modal-test').text()).toContain('testing-services');await wrapper.get('.handbook-modal-test button').trigger('click');await flushPromises();
 expect(wrapper.get('iframe.contract-html-preview').element).toBe(frame);expect(wrapper.vm.$.setupState.panelStep).toBe('review');expect(wrapper.vm.$.setupState.fieldValues.answer).toBe('Unfinished candidate answer');expect(api.post).not.toHaveBeenCalled();wrapper.unmount();
});
it('offers the same final password step for explicit app-only hires without claiming activation',async()=>{
  state.hireAccountMode='app_only';state.candidate.canFinalizeLogin=true;
  const wrapper=await mountAccount();expect(wrapper.findAll('input[autocomplete="new-password"]')).toHaveLength(2);
  expect(wrapper.text()).toContain('when People Operations activates');wrapper.unmount();
});
it.each(['app_only',null])('uses the normal reservation endpoint for non-group mode %s',async mode=>{
  state.hireAccountMode=mode;state.candidate.status='PREHIRE_OPEN';state.candidate.workEmail=null;state.portalPhase='account_setup';
  api.get.mockImplementation(async url=>({data:url.includes('suggestions')?{enabled:true,domain:'example.com',suggestions:[{email:'qa.nlu.casey.work@example.com'}]}:state}));
  const wrapper=shallowMount(Portal,{global:{stubs:{HirePortalWorkspace:{template:'<div><slot name="work-email" /></div>'}}}});
  await flushPromises();
  expect(api.get.mock.calls.some(([url])=>url.includes('account/suggestions'))).toBe(true);
  await wrapper.find('button.btn-primary').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/prehire-portal/fixture/workflow/work-email',{email:'qa.nlu.casey.work@example.com'});
  expect(api.post.mock.calls.some(([url])=>url.includes('account/provision'))).toBe(false);wrapper.unmount();
});
it('keeps group username provisioning on its existing external-account route',async()=>{
  state.candidate.status='PREHIRE_OPEN';state.candidate.workEmail=null;state.portalPhase='account_setup';
  api.get.mockImplementation(async url=>({data:url.includes('suggestions')?{enabled:true,domain:'itsco.health',suggestions:[{email:'staff@itsco.health'}]}:state}));
  const wrapper=shallowMount(Portal,{global:{stubs:{HirePortalWorkspace:{template:'<div><slot name="work-email" /></div>'}}}});
  await flushPromises();await wrapper.find('button.btn-primary').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/prehire-portal/fixture/account/provision',{workEmail:'staff@itsco.health'});wrapper.unmount();
});
