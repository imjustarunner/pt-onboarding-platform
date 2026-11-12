import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Settings from '../FamilyWelcomeSettings.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
const template = '{{parent_name}},\n\nMy name is {{provider_name}}. I was assigned to your child at {{school_name}} and will see them on {{service_day}}. Learn more: {{profile_link}}';
const sms = 'Hi {{parent_name}}, this is {{provider_name}}. Please reply with times for a brief intake meeting.';
const plan = overrides => ({ eligible: true, agencyId: 450, status: 'unconfigured', includePdf: true, mandatory: false, template, secondTemplate: template + ' Second.', finalTemplate: template + ' Final.', smsTemplate: sms,
  recommendedTemplates: { template, secondTemplate: template, finalTemplate: template, smsTemplate: sms }, previewValues: { profile_link: 'https://app.example/demo/provider/9' }, schools: [{ id: 451, name: 'Cedar Grove' }], ...overrides });
let wrapper;
const button = text => wrapper.findAll('button').find(b => b.text().includes(text));
async function mountWith(overrides) {
  api.get.mockResolvedValue({ data: plan(overrides) });
  wrapper = mount(Settings, { attachTo: document.body, props: { agencyId: 450, userId: 9, providerName: 'Alex Provider' } });
  await flushPromises();
}
beforeEach(() => vi.resetAllMocks());
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

it('shows the SchoolCareBridge Family Welcome settings with booking hours marked coming soon', async () => {
  await mountWith();
  expect(wrapper.attributes('id')).toBe('my-family-welcome');
  expect(wrapper.text()).toContain('SchoolCareBridge');
  expect(wrapper.text()).toContain('Family Welcome & Follow-Up');
  expect(wrapper.text()).toContain('Introduce yourself to new families and follow up until you connect.');
  expect(wrapper.text()).toContain('Add my available hours for booking');
  expect(wrapper.text()).toContain('Coming soon');
  expect(wrapper.text()).toContain('Preview my PDF');
  expect(wrapper.text()).toContain('Support sends an introduction email when I am assigned, and I am copied.');
  expect(wrapper.find('.fw-preview-body').text()).toContain('https://app.example/demo/provider/9');
});

it('asks for the profile link when it was removed and saves anyway on No thanks', async () => {
  api.put.mockResolvedValue({ data: plan({ status: 'enabled' }) });
  await mountWith();
  await wrapper.find('input[value="enabled"]').setValue(true);
  await wrapper.find('#fw-template').setValue(template.replace('Learn more: {{profile_link}}', 'Thanks.'));
  await button('Save Family Welcome').trigger('click'); await flushPromises();
  expect(api.put).not.toHaveBeenCalled();
  expect(wrapper.text()).toContain('Your email does not include your profile link. Please use the add profile link button in the body of your email.');
  await button('No thanks, save anyway').trigger('click'); await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/school-contact-plan', expect.objectContaining({ status: 'enabled', includePdf: true }), expect.anything());
});

it('adds the profile link, edits the one text, and saves an opt-out without the PDF', async () => {
  api.put.mockResolvedValue({ data: plan({ status: 'declined', includePdf: false }) });
  await mountWith();
  await wrapper.find('#fw-template').setValue('{{parent_name}}, I am {{provider_name}} at {{school_name}} on {{service_day}}. I look forward to meeting your family soon.');
  await button('Add profile link').trigger('click'); await flushPromises();
  expect(wrapper.find('#fw-template').element.value).toContain('{{profile_link}}');
  await button('Follow-up text at 48 hours').trigger('click');
  await wrapper.find('#fw-smsTemplate').setValue(`${sms} Thanks!`);
  await wrapper.find('.fw-options input[type="checkbox"]').setValue(false);
  await button('Save Family Welcome').trigger('click'); await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/school-contact-plan', expect.objectContaining({ status: 'declined', includePdf: false, smsTemplate: `${sms} Thanks!`, template: expect.stringContaining('{{profile_link}}') }), expect.anything());
  expect(wrapper.text()).toContain('Support will introduce you, and you will be copied.');
});

it('explains the support introduction when the provider is not in the pilot', async () => {
  await mountWith({ eligible: false });
  expect(wrapper.text()).toContain('Support introduces you to each new family, and you are copied on that email.');
  expect(wrapper.find('textarea').exists()).toBe(false);
});


it('repairs a removed automatic field with one click and previews the verified provider', async () => {
  await mountWith({ providerName: 'Verified Casey', schools: [{id:452,name:'Pine School'}] });
  const editor=wrapper.find('#fw-template');
  await editor.setValue(template.replace('{{school_name}}',''));
  expect(wrapper.text()).toContain('Use the buttons to add: School name');
  const start=editor.element.value.indexOf(' and will');
  editor.element.setSelectionRange(start,start);
  await button('School name').trigger('click'); await flushPromises();
  expect(editor.element.value).toContain('at {{school_name}} and will');
  expect(wrapper.find('.fw-preview-body').text()).toContain('Verified Casey');
  expect(wrapper.find('.fw-preview-body').text()).toContain('Pine School');
  expect(wrapper.find('.fw-preview-body').text()).not.toContain('Alex Provider');
  expect(wrapper.find('.fw-preview-body').text()).not.toContain('{{');
});

it('ignores a delayed previous-account load after switching provider context', async () => {
  let finishOld;
  api.get.mockImplementationOnce(()=>new Promise(resolve=>{finishOld=resolve;})).mockResolvedValue({data:plan({providerName:'Casey',template:template+' Casey wording.'})});
  wrapper=mount(Settings,{props:{agencyId:450,userId:9,providerName:'Old name'}});
  await wrapper.setProps({userId:10,providerName:'Casey'});await flushPromises();
  finishOld({data:plan({providerName:'Avery',template:template+' Avery wording.'})});await flushPromises();
  expect(wrapper.find('#fw-template').element.value).toContain('Casey wording.');
  expect(wrapper.text()).not.toContain('Avery wording.');
});

it('ignores a prior-account save response and clears the previous draft on scope change', async () => {
  await mountWith({status:'enabled',providerName:'Avery'});
  let finishSave;
  api.put.mockImplementationOnce(()=>new Promise(resolve=>{finishSave=resolve;}));
  await button('Save Family Welcome').trigger('click');
  api.get.mockResolvedValue({data:plan({providerName:'Casey',template:template+' Casey wording.'})});
  await wrapper.setProps({userId:10});await flushPromises();
  finishSave({data:plan({providerName:'Avery',template:template+' Avery saved.'})});await flushPromises();
  expect(wrapper.find('#fw-template').element.value).toContain('Casey wording.');
  expect(wrapper.text()).not.toContain('Avery saved.');
});

it('blocks incomplete fields before save and keeps the draft for correction', async () => {
  await mountWith();
  await wrapper.find('#fw-template').setValue(template+' Ask {{parent_name');
  await button('Save Family Welcome').trigger('click');await flushPromises();
  expect(api.put).not.toHaveBeenCalled();
  expect(wrapper.text()).toContain('An automatic field is incomplete');
  expect(wrapper.find('#fw-template').element.value).toContain('Ask {{parent_name');
});


it('previews and sends the selected assigned school without replacing reusable fields in the saved wording', async()=>{
  await mountWith({schools:[{id:451,name:'Cedar School'},{id:452,name:'Pine School'}]});
  await wrapper.find('.fw-preview select').setValue('452');
  expect(wrapper.find('.fw-preview-body').text()).toContain('Pine School');
  expect(wrapper.find('.fw-preview-body').text()).not.toContain('Cedar School');
  expect(wrapper.find('#fw-template').element.value).toContain('{{school_name}}');
  api.post.mockResolvedValue({data:{deliveredTo:'testing@itsco.health'}});
  await button('Send me an example').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/school-contact-plan/example',expect.objectContaining({schoolId:452,template:expect.stringContaining('{{school_name}}')}),expect.anything());
});

it('requires a new live pilot provider to explicitly choose On or Off before acknowledging setup', async () => {
  await mountWith({agencyId:2,rolloutPhase:'phase_1',demoOnly:false});
  expect(wrapper.findAll('input[type="radio"]').every(input=>!input.element.checked)).toBe(true);
  await button('Save Family Welcome').trigger('click');await flushPromises();
  expect(wrapper.text()).toContain('Choose On or Off');expect(api.put).not.toHaveBeenCalled();
  api.put.mockResolvedValue({data:plan({agencyId:2,rolloutPhase:'phase_1',status:'declined',welcomeSeen:true})});
  await wrapper.get('input[value="declined"]').setValue();
  await button('Save Family Welcome').trigger('click');await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/school-contact-plan',expect.objectContaining({status:'declined'}),expect.anything());
  expect(wrapper.text()).toContain('is off.');
});

it('shows assigned school days clearly and passes the selected school to the PDF preview',async()=>{
 await mountWith({schools:[{id:451,name:'Cedar Grove',serviceDayLabel:'Tuesday'},{id:452,name:'Pine',serviceDayLabel:'Thursday'}]});
 expect(wrapper.get('.fw-preview-body').text()).toContain('Tuesday');expect(wrapper.get('.fw-preview-body').text()).not.toContain('Example day');
 await wrapper.get('.fw-preview select').setValue(452);
 expect(wrapper.get('.fw-preview-body').text()).toContain('Thursday');expect(wrapper.findComponent({name:'FamilyWelcomePdfButton'}).props('schoolId')).toBe(452);
});

it('explains missing messaging setup before a provider can choose On',async()=>{
 await mountWith({demoOnly:false,rolloutPhase:'assigned_school_providers',canEnable:false,setupNotice:'Your messaging email needs support setup.'});
 expect(wrapper.get('input[value="enabled"]').element.disabled).toBe(true);expect(wrapper.get('input[value="declined"]').element.disabled).toBe(false);
 expect(wrapper.text()).toContain('messaging email needs support setup');
});
