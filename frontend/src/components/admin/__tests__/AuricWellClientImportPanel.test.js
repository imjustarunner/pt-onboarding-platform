import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{role:'super_admin'}})}));
import Panel from '../AuricWellClientImportPanel.vue';
let wrappers=[];
const chart={id:42,agency_id:2,full_name:'Ann Example',date_of_birth:'2000-01-02',contact_phone:'555-222-3333'};
const contact={id:11,agencyContactId:9,contact:{id:9,fullName:'Pat Example',email:'pat@example.com'},emailRemindersEnabled:true};
function open(props={}){const w=mount(Panel,{props:{agencyId:2,clientId:42,clientLabel:'Ann Example',...props},global:{stubs:{ClientEhrBringUpToDatePanel:true,InsurancePolicyFields:true}}});wrappers.push(w);return w;}
const button=(w,text)=>w.findAll('button').find(b=>b.text()===text);
const check=(w,text)=>w.findAll('label').find(label=>label.text().includes(text)).find('input[type=checkbox]');
const click=async(w,text)=>{await button(w,text).trigger('click');await flushPromises();};
beforeEach(()=>{
  vi.resetAllMocks();
  api.get.mockImplementation(async url=>url.endsWith('/contacts')?{data:{items:[contact]}}:url.endsWith('/insurance')?{data:{insurance:{primary:{insurerName:'Old carrier',memberId:'OLD',groupNumber:'KEEP'},secondary:{insurerName:'Existing secondary',memberId:'S2'}},demographics:{firstName:'Ann',lastName:'Example',dateOfBirth:'2000-01-02'}}}:{data:chart});
  api.post.mockImplementation(async url=>url.endsWith('/demographics/parse')?{data:{parsed:{fullName:'Ann Example',dateOfBirth:'2000-01-02',contactPhone:'555-111-2222'}}}:{data:{affiliation:contact}});
  api.put.mockResolvedValue({data:{}});
});
afterEach(()=>{wrappers.forEach(w=>w.unmount());wrappers=[];});

it('keeps identity paste supplied by the workbench and reviews patient fields separately from contacts',async()=>{
  const w=open({initialDemographics:'Legal Name\nAnn Example\nAdditional Contacts\nName: Pat Example\nEmail: pat@example.com',sourceEhr:'Prior EHR'});
  expect(w.find('textarea').element.value).toContain('Legal Name');
  await click(w,'Review demographics and contacts');
  expect(api.post).toHaveBeenCalledWith('/clients/42/demographics/parse',{text:'Legal Name\nAnn Example'},expect.anything());
  expect(w.text()).toContain('Current chart');
  await check(w,'I compared the selected demographics').setValue(true);
  await click(w,'Save reviewed demographics and contacts');
  expect(api.post).toHaveBeenCalledWith('/clients/42/contacts',expect.objectContaining({existingContactId:9,importContext:'ehr_transition',emailRemindersEnabled:false,smsRemindersEnabled:false,acknowledgeNotify:false,recipientPermissionToInvite:false}),expect.anything());
  expect(api.post.mock.calls.some(([url])=>/guardian|invitation|claim/.test(url))).toBe(false);
  expect(w.emitted('saved')[0][0]).toMatchObject({clientId:42,steps:{demographics:'saved',contacts:'saved'}});
  expect(w.findComponent({name:'ClientEhrBringUpToDatePanel'}).props('sourceSystem')).toBe('Prior EHR');
});

it('holds ambiguous contacts before any demographic/contact writes until a contact is chosen',async()=>{
  api.get.mockImplementation(async url=>url.endsWith('/contacts')?{data:{items:[contact,{...contact,id:12,contact:{...contact.contact,id:10}}]}}:{data:chart});
  const w=open({initialDemographics:'Legal Name\nAnn Example\nAdditional Contacts\nName: Pat Example\nEmail: pat@example.com'});
  await click(w,'Review demographics and contacts');
  await check(w,'I compared the selected demographics').setValue(true);
  await click(w,'Save reviewed demographics and contacts');
  expect(w.get('[role=alert]').text()).toContain('Choose the correct chart contact');
  expect(api.post.mock.calls.filter(([url])=>!url.endsWith('/parse'))).toHaveLength(0);
  await w.find('.aw-contact select').setValue('9');
  await check(w,'I compared the selected demographics').setValue(true);
  await click(w,'Save reviewed demographics and contacts');
  expect(api.post.mock.calls.filter(([url])=>url.endsWith('/contacts'))).toHaveLength(1);
});

it('preserves successful demographics when a contact fails and resumes only that contact on retry',async()=>{
  let contactAttempts=0;
  api.post.mockImplementation(async url=>{
    if(url.endsWith('/parse'))return {data:{parsed:{fullName:'Ann Example'}}};
    if(url.endsWith('/contacts')&&++contactAttempts===1)throw new Error('Contact save unavailable');
    return {data:{affiliation:contact}};
  });
  const w=open({initialDemographics:'Legal Name\nAnn Example\nAdditional Contacts\nName: Pat Example\nEmail: pat@example.com'});
  await click(w,'Review demographics and contacts');await check(w,'I compared the selected demographics').setValue(true);
  await click(w,'Save reviewed demographics and contacts');
  expect(w.emitted('saved')).toBeUndefined();
  await click(w,'Save reviewed demographics and contacts');
  expect(api.post.mock.calls.filter(([url])=>url.endsWith('/demographics/import'))).toHaveLength(1);
  expect(contactAttempts).toBe(2);expect(w.emitted('saved')).toHaveLength(1);
});

it('merges primary insurance with existing fields and preserves secondary coverage before reviewed save',async()=>{
  const w=open();await w.findAll('textarea')[2].setValue('Primary Insurance: New carrier\nMember ID: NEW');
  await click(w,'Review insurance');
  await check(w,'I compared the client, subscriber').setValue(true);
  await click(w,'Save reviewed insurance for billing review');
  const [path,payload]=api.put.mock.calls[0];
  expect(path).toBe('/medical-billing/clients/42/insurance');
  expect(payload).toMatchObject({importContext:'ehr_transition',primary:{insurerName:'New carrier',memberId:'NEW',groupNumber:'KEEP'},secondary:{insurerName:'Existing secondary',memberId:'S2'},patient:{firstName:'Ann',lastName:'Example'}});
  expect(payload).not.toHaveProperty('verifiedForClaims');
  expect(w.emitted('saved')[0][0].steps.insurance).toBe('saved');
});

it('locks reviewed insurance fields while saving so the submitted source cannot change mid-request',async()=>{
  let finish;api.put.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const w=open();await w.findAll('textarea')[2].setValue('Primary Insurance: New carrier\nMember ID: NEW');
  await click(w,'Review insurance');await check(w,'I compared the client, subscriber').setValue(true);
  await button(w,'Save reviewed insurance for billing review').trigger('click');
  expect(w.findAll('fieldset.aw-policy').every(fieldset=>fieldset.element.disabled)).toBe(true);
  finish({data:{}});await flushPromises();
  expect(w.findAll('fieldset.aw-policy').every(fieldset=>!fieldset.element.disabled)).toBe(true);
});

it('stops additional writes and completion when the selected client changes during save',async()=>{
  let finish;
  api.post.mockImplementation(url=>url.endsWith('/parse')?Promise.resolve({data:{parsed:{fullName:'Ann Example'}}}):new Promise(resolve=>{finish=resolve;}));
  const w=open({initialDemographics:'Legal Name\nAnn Example\nAdditional Contacts\nName: Pat Example\nEmail: pat@example.com'});
  await click(w,'Review demographics and contacts');await check(w,'I compared the selected demographics').setValue(true);
  await button(w,'Save reviewed demographics and contacts').trigger('click');
  await w.setProps({clientId:77});finish({data:{}});await flushPromises();
  expect(api.post.mock.calls.some(([url])=>url.endsWith('/contacts'))).toBe(false);
  expect(w.emitted('saved')).toBeUndefined();
  expect(w.emitted('busy').flat()).toContain(true);
});
