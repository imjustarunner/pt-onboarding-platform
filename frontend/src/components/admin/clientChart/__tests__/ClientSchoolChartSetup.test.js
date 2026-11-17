import { requiresClientRecordImport } from '../../../../utils/clientRecordImport.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
const {get,post}=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../../services/api',()=>({default:{get,post}}));
import Setup from '../ClientChartSetupPanel.vue';
let wrapper;
const missingDemographics = {schoolClient:true,demographicsOnFile:false,intakeOnFile:true,planOnFile:true,setupComplete:false};
beforeEach(()=>{vi.resetAllMocks();get.mockResolvedValue({data:{...missingDemographics}});});
afterEach(()=>wrapper?.unmount());
it('offers the same missing demographics workflow for school charts',async()=>{
 wrapper=shallowMount(Setup,{props:{clientId:7,agencyId:2,client:{client_type:'school'},scope:'demographics'}});await flushPromises();expect(wrapper.text()).toContain('Paste demographics');
});
it('uses the standard all-record updater for a school chart',async()=>{
 wrapper=shallowMount(Setup,{props:{clientId:7,agencyId:2,client:{client_type:'school'},scope:'all'}});await flushPromises();
 const updater=wrapper.findComponent({name:'ClientEhrBringUpToDatePanel'});expect(updater.exists()).toBe(true);expect(updater.props('recordStatus')).toEqual({demographics:'missing',intake:'done',plan:'done'});
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function mountDemographics() {
  wrapper = shallowMount(Setup, { props: { clientId: 7, agencyId: 2, client: { client_type: 'school' }, scope: 'demographics' } });
  await flushPromises();
}

async function reviewPaste(text) {
  await wrapper.find('textarea').setValue(text);
  await wrapper.findAll('button').find(button => button.text() === 'Review paste').trigger('click');
}

it('clears the previous client’s packet and pasted data before the next chart status arrives', async () => {
  get.mockResolvedValueOnce({ data: { ...missingDemographics, paperPacket: true, packetCandidate: { fullName: 'Previous Client' } } });
  await mountDemographics();
  await wrapper.find('textarea').setValue('Previous client demographics');
  await wrapper.findAll('button').find(button => button.text() === 'Use packet read').trigger('click');
  expect(wrapper.findComponent({ name: 'DemographicMergeFields' }).props('rows')[0].incoming).toBe('Previous');

  const nextStatus = deferred();
  get.mockReturnValueOnce(nextStatus.promise);
  await wrapper.setProps({ clientId: 8, client: { client_type: 'school' } });
  expect(wrapper.find('.chart-setup').exists()).toBe(false);
  nextStatus.resolve({ data: { ...missingDemographics } });
  await flushPromises();

  expect(wrapper.find('textarea').element.value).toBe('');
  expect(wrapper.findComponent({ name: 'DemographicMergeFields' }).exists()).toBe(false);
  expect(wrapper.text()).not.toContain('Use packet read');
});

it('discards an old status response after the client selection is cleared', async () => {
  const pending = deferred();
  get.mockReturnValueOnce(pending.promise);
  wrapper = shallowMount(Setup, { props: { clientId: 7, agencyId: 2, scope: 'demographics' } });
  await wrapper.setProps({ clientId: 0 });
  pending.resolve({ data: { ...missingDemographics, packetCandidate: { fullName: 'Previous Client' } } });
  await flushPromises();
  expect(wrapper.find('.chart-setup').exists()).toBe(false);
});

it('ignores a previous client’s late parse without ending the current client’s pending review', async () => {
  await mountDemographics();
  const oldParse = deferred(), newParse = deferred();
  post.mockReturnValueOnce(oldParse.promise).mockReturnValueOnce(newParse.promise);
  await reviewPaste('Previous client demographics');
  await wrapper.setProps({ clientId: 8 });
  await flushPromises();
  await reviewPaste('Current client demographics');

  oldParse.resolve({ data: { parsed: { fullName: 'Previous Client' } } });
  await flushPromises();
  expect(wrapper.findComponent({ name: 'DemographicMergeFields' }).exists()).toBe(false);
  expect(wrapper.findAll('button').find(button => button.text() === 'Reading…').attributes('disabled')).toBeDefined();

  newParse.resolve({ data: { parsed: { fullName: 'Current Client' } } });
  await flushPromises();
  expect(wrapper.findComponent({ name: 'DemographicMergeFields' }).props('rows')[0].incoming).toBe('Current');
  expect(post.mock.calls.map(([url]) => url)).toEqual(['/clients/7/demographics/parse', '/clients/8/demographics/parse']);
});

it('keeps the current review and emits no previous-client update when an earlier save finishes', async () => {
  await mountDemographics();
  const oldSave = deferred();
  post.mockResolvedValueOnce({ data: { parsed: { fullName: 'Previous Client' } } })
    .mockReturnValueOnce(oldSave.promise)
    .mockResolvedValueOnce({ data: { parsed: { fullName: 'Current Client' } } });
  await reviewPaste('Previous client demographics');
  await flushPromises();
  wrapper.findComponent({ name: 'DemographicMergeFields' }).vm.$emit('save');
  await flushPromises();
  expect(post.mock.calls[1][0]).toBe('/clients/7/demographics/import');

  await wrapper.setProps({ clientId: 8 });
  await flushPromises();
  await reviewPaste('Current client demographics');
  await flushPromises();
  oldSave.resolve({ data: { client: { id: 7, full_name: 'Previous Client' } } });
  await flushPromises();

  expect(wrapper.emitted('updated')).toBeUndefined();
  expect(wrapper.find('textarea').element.value).toBe('Current client demographics');
  expect(wrapper.findComponent({ name: 'DemographicMergeFields' }).props('rows')[0].incoming).toBe('Current');
});

it('clears open import dialogs and their pasted text when the chart agency changes', async () => {
  get.mockResolvedValue({ data: { ...missingDemographics, intakeOnFile: false } });
  wrapper = shallowMount(Setup, { props: { clientId: 7, agencyId: 2, scope: 'intake' } });
  await flushPromises();
  await wrapper.find('textarea').setValue('Previous agency intake');
  await wrapper.find('button').trigger('click');
  expect(wrapper.findComponent({ name: 'NoteAidIntakeImportReview' }).props('open')).toBe(true);

  await wrapper.setProps({ agencyId: 3 });
  await flushPromises();
  expect(wrapper.find('textarea').element.value).toBe('');
  const dialog = wrapper.findComponent({ name: 'NoteAidIntakeImportReview' });
  expect(dialog.props('open')).toBe(false);
  expect(dialog.props('initialText')).toBe('');
});

it.each(['all', 'demographics', 'intake', 'plan'])('omits record import prompts for native office submissions in %s', async scope => {
 get.mockResolvedValue({data:{demographicsOnFile:true,intakeOnFile:false,planOnFile:false,setupComplete:false,requiresRecordImport:false}});
 wrapper=shallowMount(Setup,{props:{clientId:7,agencyId:2,client:{client_type:'clinical',source:'PUBLIC_INTAKE_LINK'},scope}});
 await flushPromises();expect(wrapper.find('.chart-setup').exists()).toBe(false);
});
it.each(['PUBLIC_INTAKE_LINK','PUBLIC_OFFICE_INTAKE','DIGITAL_FORM','ADAPTIVE_QUICK_PROSPECTIVE','PUBLIC_BOOKING_INQUIRY'])('excludes %s office submissions from update actions and queues', source => {
 expect(requiresClientRecordImport({source,client_type:'clinical',organization_type:'clinical'})).toBe(false);
 expect(requiresClientRecordImport({source,client_type:'school'})).toBe(true);
});
it('keeps update actions available for legacy office records',()=>{
 expect(requiresClientRecordImport({source:'BULK_IMPORT',client_type:'clinical'})).toBe(true);
});
