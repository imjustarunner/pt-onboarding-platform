import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import View from '../ClientSchoolRoiAccessTab.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
let wrapper;
const payload = (clientId, completed = true) => ({ roi_expired: false, staff: [], school_roi_signing: {
  available_links: [{ id: 1, title: 'School ROI' }], selected_intake_link_id: 1, issued_link: null,
  completed_documents: completed ? [{ id: clientId + 100, signed_at: '2026-11-08T05:21:49Z', signer_name: `Parent ${clientId}` }] : []
} });
beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue({ data: payload(4) }); });
afterEach(() => wrapper?.unmount());
it('shows signed enrollment ROI evidence even when no standalone signing link was issued', async () => {
  wrapper = mount(View, { props: { client: { id: 4 } } }); await flushPromises();
  expect(wrapper.text()).toContain('Completed');expect(wrapper.text()).toContain('Parent 4');
  expect(wrapper.text()).not.toContain('Not issued');expect(wrapper.text()).not.toContain('Start Signing Session');
  const popup = { opener: {}, location: {}, close: vi.fn() };vi.spyOn(window, 'open').mockReturnValue(popup);
  api.get.mockResolvedValueOnce({ data: { url: 'https://storage.example.test/signed-roi' } });
  await wrapper.findAll('button').find(b => b.text() === 'View signed ROI').trigger('click');await flushPromises();
  expect(api.get).toHaveBeenLastCalledWith('/clients/4/school-roi-documents/104/view');
  expect(popup.location.href).toBe('https://storage.example.test/signed-roi');expect(api.post).not.toHaveBeenCalled();
});
it('keeps an older sibling response from replacing the selected child’s ROI evidence', async () => {
  let finishOld;api.get.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
  wrapper = mount(View, { props: { client: { id: 4 } } });
  api.get.mockResolvedValueOnce({ data: payload(5) });await wrapper.setProps({ client: { id: 5 } });await flushPromises();
  finishOld({ data: payload(4) });await flushPromises();
  expect(wrapper.text()).toContain('Parent 5');expect(wrapper.text()).not.toContain('Parent 4');
});
it('retains initial signing for a client with no signed ROI', async () => {
  api.get.mockResolvedValue({ data: payload(4, false) });wrapper = mount(View, { props: { client: { id: 4 } } });await flushPromises();
  expect(wrapper.text()).toContain('Start Signing Session');expect(wrapper.text()).not.toContain('View signed ROI');
});

it('opens source-bound paper review instead of offering staff grants that the server will reject', async () => {
  const staff=[{school_staff_user_id:9,first_name:'School',last_name:'Staff',access_level:'packet',effective_access_state:'packet'}];
  api.get.mockResolvedValue({data:{...payload(4,false),staff,paper_packet_review_required:true,paper_packet_staff_roi_pending:true,paper_packet_vision:{status:'applied'}}});
  wrapper=mount(View,{props:{client:{id:4}},global:{stubs:{SchoolPaperPacketWorkflow:{props:['clientId'],template:'<button class="finish-review" @click="$emit(\'processed\')">Review fixture</button>'}}}});await flushPromises();
  expect(wrapper.text()).toContain('Review the uploaded paper packet before granting staff access');
  expect(wrapper.text()).not.toContain('school staff ROI was auto-applied');
  const staffSelect=wrapper.get('tbody select');
  expect(staffSelect.get('option[value="roi"]').element.disabled).toBe(true);
  expect(staffSelect.get('option[value="packet"]').element.disabled).toBe(false);
  await wrapper.findAll('button').find(b=>b.text()==='Process paper packet').trigger('click');await flushPromises();
  expect(wrapper.findComponent({name:'SchoolPaperPacketWorkflow'}).exists() || wrapper.find('.finish-review').exists()).toBe(true);
  expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
  api.get.mockResolvedValue({data:{...payload(4),staff,paper_packet_review_required:false}});
  await wrapper.get('.finish-review').trigger('click');await flushPromises();
  expect(wrapper.find('.paper-packet-review').exists()).toBe(false);
  expect(wrapper.get('tbody select option[value="roi"]').element.disabled).toBe(false);
});

const guardians = [
  {guardian_user_id:21,first_name:'Wren',last_name:'QA',email:'testing+wren@example.test',can_request_roi:true},
  {guardian_user_id:22,first_name:'Ash',last_name:'QA',email:'testing+ash@example.test',can_request_roi:true}
];
const requestButton = () => wrapper.findAll('button').find(b => b.text() === 'Request ROI from selected guardians');
it('sends only the checked guardian and describes a successful testing redirect without false failure', async () => {
  const initial={...payload(4),guardian_emails:guardians};
  api.get.mockResolvedValue({data:initial});
  wrapper=mount(View,{props:{client:{id:4}}});await flushPromises();
  await wrapper.findAll('fieldset input[type="checkbox"]')[1].setValue(false);
  api.post.mockResolvedValue({data:{ok:true,deliveries:[{guardianUserId:21,name:'Wren QA',email:'testing+wren@example.test',sent:false,status:'redirected'}]}});
  api.get.mockResolvedValueOnce({data:{...initial,school_roi_signing:{...initial.school_roi_signing,pending_guardian_requests:[{id:391,guardian_user_id:21,guardian_name:'Wren QA',status:'issued'}]}}});
  await requestButton().trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledExactlyOnceWith('/clients/4/school-roi-signing-email',{languageCode:'en',guardianUserIds:[21]});
  expect(wrapper.text()).toContain('Wren QA: Redirected to testing inbox');
  expect(wrapper.text()).not.toContain('Needs follow-up');
  expect(wrapper.get('.roi-pending-requests').text()).toContain('Wren QA — request 391');
  expect(wrapper.get('.roi-pending-requests').text()).not.toContain('Ash');
  expect(wrapper.findAll('fieldset input[type="checkbox"]')[1].element.checked).toBe(false);
  expect(wrapper.text()).not.toContain('No new signing has been requested');
});
it('passes an explicit both-guardian selection while preserving per-recipient pending versus sent outcomes', async () => {
  api.get.mockResolvedValue({data:{...payload(4),guardian_emails:guardians}});
  wrapper=mount(View,{props:{client:{id:4}}});await flushPromises();
  await wrapper.get('select').setValue('es');
  api.post.mockResolvedValue({data:{deliveries:[{guardianUserId:21,name:'Wren QA',status:'sent'},{guardianUserId:22,name:'Ash QA',status:'pending'}]}});
  await requestButton().trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/clients/4/school-roi-signing-email',{languageCode:'es',guardianUserIds:[21,22]});
  expect(wrapper.text()).toContain('Wren QA: Sent');expect(wrapper.text()).toContain('Ash QA: Awaiting delivery approval');
});
it('ignores a late request response after switching children', async () => {
  let resolveSend;api.get.mockResolvedValue({data:{...payload(4),guardian_emails:guardians}});
  wrapper=mount(View,{props:{client:{id:4}}});await flushPromises();
  api.post.mockImplementationOnce(() => new Promise(resolve=>{resolveSend=resolve;}));
  await requestButton().trigger('click');
  api.get.mockResolvedValueOnce({data:payload(5)});await wrapper.setProps({client:{id:5}});await flushPromises();
  resolveSend({data:{deliveries:[{guardianUserId:21,name:'Wren QA',status:'redirected'}]}});await flushPromises();
  expect(wrapper.text()).toContain('Parent 5');expect(wrapper.text()).not.toContain('Redirected to testing inbox');
  expect(api.get.mock.calls.filter(([url])=>url==='/clients/4/school-roi-access')).toHaveLength(1);
});
it('labels superseded signed evidence and does not open another signing session without an actual request', async () => {
  const initial=payload(4);initial.school_roi_signing.completed_documents=[
    {id:104,signer_name:'Wren',signed_at:'2026-11-12T20:00:00Z',evidence_state:'latest_signed'},
    {id:103,signer_name:'Wren',signed_at:'2026-11-08T20:00:00Z',evidence_state:'superseded'}
  ];api.get.mockResolvedValue({data:initial});wrapper=mount(View,{props:{client:{id:4}}});await flushPromises();
  expect(wrapper.text()).toContain('Historical / superseded');expect(wrapper.text()).toContain('Most recent signed record');
  expect(wrapper.text()).toContain('No new signing has been requested');expect(wrapper.text()).not.toContain('Start Signing Session');
  expect(api.post).not.toHaveBeenCalled();
});
it('keeps another school’s signed record historical while allowing a first release for this school', async () => {
  const initial=payload(4);initial.school_roi_signing.completed_documents[0].evidence_state='historical_other_school';
  api.get.mockResolvedValue({data:initial});wrapper=mount(View,{props:{client:{id:4}}});await flushPromises();
  expect(wrapper.text()).toContain('Historical — another school');expect(wrapper.text()).toContain('Start Signing Session');
  expect(wrapper.text()).not.toContain('No new signing has been requested');
});
it('shows an existing own-guardian request without offering an additional unbound signing session', async () => {
  const initial=payload(4,false);initial.school_roi_signing.pending_guardian_requests=[{id:391,guardian_user_id:21,guardian_name:'Wren QA',status:'issued'}];
  api.get.mockResolvedValue({data:initial});wrapper=mount(View,{props:{client:{id:4}}});await flushPromises();
  expect(wrapper.text()).toContain('Guardian update pending');expect(wrapper.get('.roi-pending-requests').text()).toContain('request 391');
  expect(wrapper.text()).not.toContain('Start Signing Session');expect(api.post).not.toHaveBeenCalled();
});
