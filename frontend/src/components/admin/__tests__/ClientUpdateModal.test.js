import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Modal from '../ClientUpdateModal.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
let wrapper;
const props={open:true,clientId:5,agencyId:2,guardianEmail:'caregiver@example.invalid',guardianName:'Care Giver'};
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async url=>({data:url==='/client-updates/status'?{enabled:true}:{documents:[{id:1,name:'Current consent'}],assessments:[],portalSteps:[],recipients:[{id:3,name:"Care Giver",email:props.guardianEmail,forms:true,billing:true}]}}));api.post.mockImplementation(async url=>({data:url.endsWith('/send')?{deliveryStatus:'queued'}:{request:{id:7}}}));});
afterEach(()=>wrapper?.unmount());
async function selectDocument(){await flushPromises();await wrapper.get('.cu-grid input[type=checkbox]').setValue(true);}
const sendButton=()=>wrapper.findAll('button').find(b=>b.text()==='Send portal update');
it('shows an honest rollout hold without creating a client, assigning forms or sending',async()=>{api.get.mockResolvedValue({data:{enabled:false}});wrapper=mount(Modal,{props});await flushPromises();expect(wrapper.text()).toContain('on hold');expect(wrapper.find('input').exists()).toBe(false);expect(api.get).toHaveBeenCalledTimes(1);expect(api.post).not.toHaveBeenCalled();});
it('saves the selected update and makes one explicit delivery attempt without claiming an approval is sent',async()=>{wrapper=mount(Modal,{props});await selectDocument();await sendButton().trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/clients/5/updates',expect.objectContaining({agencyId:2,send:false,documents:[1]}));expect(api.post).toHaveBeenCalledWith('/clients/5/updates/7/send',{guardianEmail:props.guardianEmail});expect(wrapper.text()).toContain('queued for approval');expect(wrapper.emitted('sent')).toBeUndefined();expect(sendButton().attributes('disabled')).toBeDefined();});
it('does not replay an uncertain mail attempt when the modal remains open',async()=>{api.post.mockImplementation(async url=>{if(url.endsWith('/send'))throw new Error('Connection lost');return {data:{request:{id:7}}};});wrapper=mount(Modal,{props});await selectDocument();await sendButton().trigger('click');await flushPromises();expect(wrapper.text()).toContain('Check email history');expect(sendButton().attributes('disabled')).toBeDefined();expect(api.post).toHaveBeenCalledTimes(2);});
it('does not send a late draft result after the selected client changes',async()=>{let finish;api.post.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));wrapper=mount(Modal,{props});await selectDocument();await sendButton().trigger('click');await wrapper.setProps({clientId:6});await flushPromises();finish({data:{request:{id:7}}});await flushPromises();expect(api.post).toHaveBeenCalledTimes(1);expect(wrapper.text()).not.toContain('Portal update sent');});

it('shows each guardian delivery separately without claiming a failed request was sent',async()=>{
 api.post.mockImplementation(async url=>({data:url.endsWith('/send')?{deliveryStatus:'needs_followup',deliveries:[{name:'Parent One',deliveryStatus:'sent'},{name:'Parent Two',deliveryStatus:'needs_followup'}]}:{request:{id:7}}}));
 wrapper=mount(Modal,{props});await selectDocument();await sendButton().trigger('click');await flushPromises();
 expect(wrapper.text()).toContain('Parent One: sent');expect(wrapper.text()).toContain('Parent Two: needs followup');expect(wrapper.emitted('sent')).toBeUndefined();
});

it('assigns an authorization-only task to a linked billing recipient without clinical access',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/status')?{enabled:true}:{portalSteps:[{key:'authorization',title:'Payment authorization'}],recipients:[{id:7,name:'Billing guardian',billing:true,forms:false,email:'billing@example.invalid'}]}}));
 api.post.mockResolvedValueOnce({data:{noticeId:42}}).mockResolvedValueOnce({data:{queued:true}});
 wrapper=mount(Modal,{props});await selectDocument();await sendButton().trigger('click');await flushPromises();
 expect(api.post.mock.calls).toEqual([['/family-billing/staff/tasks',{agencyId:2,guardianUserId:7,clientIds:[5],fromPortal:true,requireCard:false}],['/family-billing/staff/notices/42/send',{agencyId:2}]]);
 expect(wrapper.text()).toContain('Notification queued');
});
it('keeps an intake email from becoming a recipient without a linked account',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/status')?{enabled:true}:{documents:[{id:1,name:'Consent'}],recipients:[]}}));
 wrapper=mount(Modal,{props});await selectDocument();expect(sendButton().attributes('disabled')).toBeDefined();expect(api.post).not.toHaveBeenCalled();
});

const recipient = {id:3, name:'Test Guardian', kind:'guardian', email:'guardian@example.invalid', forms:true, billing:true};
const foundation = {key:'client-rights', title:'Client rights'};
function combinedWorkspace() {
  api.get.mockImplementation(async url => {
    if (url.endsWith('/status')) return {data:{enabled:true}};
    if (url==='/clinical-forms') return {data:{plans:[
      {id:80,version:1,title:'Signed release',documentKey:'release-of-information',portalAssignments:[
        {signerId:11,version:1,recipient:recipient.name,signedAt:'2026-11-01T12:00:00Z'}
      ]},
      {id:81,version:1,title:'Unshared draft'}
    ]}};
    if (url==='/clients/5/updates/catalog') return {data:{
      recipients:[recipient],portalSteps:[{key:'authorization',title:'Payment authorization'}],items:[
        {id:9,item_type:'assessment',title:'Sample assessment',status:'in_progress',requestCompleted:1,requestTotal:2}
      ]}};
    if (url==='/enrollment-portal/clients/5/catalog') return {data:{recipients:[recipient],documents:[foundation]}};
    if (url.endsWith('/preview/client-rights')) return {data:{key:'enrollment-document',title:'Client rights',sourceHtml:'<p>Actual enrollment notice</p>',sections:[]}};
    if (url.endsWith('/preview/portalSteps/authorization')) return {data:{terms:'Payment terms for the selected family'}};
    throw new Error('Unexpected request '+url);
  });
  wrapper=mount(Modal,{props:{...props,inline:true,clinicalMode:'full',agencyName:'Example Agency'}});
}
const button = label => wrapper.findAll('button').find(b=>b.text()===label);
async function selectMixedItems() {
  await flushPromises();
  await button('Select individual items').trigger('click');
  for(const row of wrapper.findAll('.pick-row').filter(r=>['Payment authorization','Client rights'].some(title=>r.text().startsWith(title)))) {
    await row.get('input[type=checkbox]').setValue(true);
  }
}
it('combines both histories and previews multiple actual forms in recipient order without assigning them',async()=>{
  combinedWorkspace();
  await flushPromises();
  expect(wrapper.find('.picker-panel').exists()).toBe(false);
  expect(wrapper.findAll('.cu-metrics button')).toHaveLength(5);
  expect(wrapper.get('.assigned-list').text()).toContain('Signed release');
  expect(wrapper.get('.assigned-list').text()).not.toContain('Unshared draft');
  expect(wrapper.get('progress').attributes('max')).toBe('2');
  await selectMixedItems();
  expect(sendButton().attributes('disabled')).toBeDefined();
  await button('Preview selection').trigger('click');
  await flushPromises();
  expect(wrapper.get('dialog').text()).toContain('Payment terms for the selected family');
  await button('Next').trigger('click');
  await flushPromises();
  expect(wrapper.get('dialog fieldset[disabled]').text()).toContain('Actual enrollment notice');
  expect(wrapper.get('dialog').text()).toContain('2 of 2');
  await button('Close preview').trigger('click');
  await button('Refresh').trigger('click');
  await flushPromises();
  expect(wrapper.findAll('.review-selection li')).toHaveLength(2);
  expect(api.post).not.toHaveBeenCalled();
});
it('preserves a successfully assigned form when the remaining billing assignment needs a retry',async()=>{
  combinedWorkspace();
  await selectMixedItems();
  await wrapper.get('.review-selection input[type=checkbox]').setValue(true);
  api.post.mockImplementation(async url=>{
    if(url.endsWith('/assignments'))return {data:{assignedCount:1}};
    throw {response:{status:422,data:{error:{message:'Review payer selection'}}}};
  });
  await sendButton().trigger('click');
  await flushPromises();
  expect(wrapper.text()).toContain('Enrollment documents were assigned');
  expect(wrapper.findAll('.review-selection li').map(li=>li.text())).toEqual(['Payment authorization']);
  expect(wrapper.get('.review-selection select').element.value).toBe('3');
  expect(api.post.mock.calls[0][1]).toMatchObject({recipient:{id:3,kind:'guardian'},documents:[{foundationKey:'client-rights'}],authorityConfirmed:true});
  api.post.mockImplementation(async url=>({data:url.endsWith('/tasks')?{noticeId:23}:{queued:true}}));
  await sendButton().trigger('click');
  await flushPromises();
  expect(api.post.mock.calls.filter(([url])=>url.endsWith('/assignments'))).toHaveLength(1);
  expect(wrapper.text()).toContain('Notification queued');
});

it('scopes a guardian-profile request and its history to the selected guardian', async () => {
  const otherGuardian = {id:4, name:'Other account', kind:'guardian', email:'other@example.invalid', forms:true};
  api.get.mockImplementation(async url => ({data:url.endsWith('/status') ? {enabled:true} : {
    documents:[{id:1,name:'Current consent'}], recipients:[recipient, otherGuardian],
    items:[
      {id:7,item_type:'document',title:'This guardian’s request',status:'pending',recipientUserId:3},
      {id:8,item_type:'document',title:'Other guardian’s request',status:'pending',recipientUserId:4}
    ]
  }}));
  wrapper=mount(Modal,{props:{...props,recipientGuardianId:3}});
  await selectDocument();
  expect(wrapper.text()).toContain('This guardian’s request');
  expect(wrapper.text()).not.toContain('Other guardian’s request');
  expect(wrapper.findAll('option').some(option=>option.text().includes(otherGuardian.name))).toBe(false);
  await sendButton().trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/clients/5/updates',expect.objectContaining({guardianUserId:3,documents:[1]}));
});


it('lists reviewed assessments and the client’s current school forms without offering draft assessments for assignment', async () => {
  api.get.mockImplementation(async url => {
    if (url.endsWith('/status')) return {data:{enabled:true}};
    if (url==='/clinical-forms') return {data:{plans:[]}};
    if (url.endsWith('/updates/catalog')) return {data:{recipients:[recipient],schoolClient:true,schoolName:'Test Elementary',schoolCity:'Colorado Springs',
      assessments:[
        {family:'life_balance',title:'Life Balance',assignable:true},
        {family:'gad-7',title:'GAD-7',assignable:false,availabilityLabel:'Available in Outcome Measures'},
        {family:'cssrs-screener',title:'C-SSRS',assignable:false,availabilityLabel:'Available in Clinical Forms'},
        {family:'scared-5-parent',title:'SCARED-5 · Parent report',assignable:false,availabilityLabel:'Available in dependent counseling intake'},
        {family:'values_alignment',title:'Values Alignment',assignable:false}
      ],
      portalSteps:[{key:'payment',title:'Payment setup'},{key:'information',title:'Verify contact information'}]}};
    if (url.endsWith('/catalog')) return {data:{recipients:[recipient],documents:[
      {key:'portal-psc-17',title:'PSC-17 · Parent report',instrumentId:'psc-17'},
      {key:'informed-consent',title:'Informed consent'},{key:'policy-services',title:'Policy and services'},{key:'hipaa-notice',title:'Privacy notice'}
    ],refreshFoundationKeys:['informed-consent','policy-services','hipaa-notice']}};
    throw new Error('Unexpected request '+url);
  });
  wrapper=mount(Modal,{props:{...props,inline:true,clinicalMode:'full',recipientGuardianId:3}});
  await flushPromises();
  await button('Select individual items').trigger('click');
  const row = title => wrapper.findAll('.pick-row').find(item=>item.text().startsWith(title));
  expect(row('Smart School ROI').text()).toContain('Test Elementary');
  expect(row('Life Balance').find('input').exists()).toBe(true);
  expect(row('GAD-7').text()).toContain('Available in Outcome Measures');
  expect(row('C-SSRS').text()).toContain('Available in Clinical Forms');
  expect(row('Values Alignment').text()).toContain('Coming soon');
  expect(row('GAD-7').find('input').exists()).toBe(false);
  expect(row('SCARED-5').text()).toContain('Available in dependent counseling intake');
  expect(row('School disclosure').text()).toContain('Colorado Springs');
  expect(row('PSC-17').get('input').exists()).toBe(true);
  await button('Bring client records up to date').trigger('click');
  expect(wrapper.findAll('.review-selection li').map(item=>item.text())).toEqual([
    'Assigned provider disclosure','Verify contact information','Informed consent','Policy and services','Privacy notice'
  ]);
  expect(api.post).not.toHaveBeenCalled();
});

it.each([true,false])('uses the provider disclosure shortcut with recorded signing authority %s',async recordedSigningAuthority=>{
  api.get.mockImplementation(async url=>{
    if(url.endsWith('/status')) return {data:{enabled:true}};
    if(url==='/clinical-forms') return {data:{plans:[]}};
    if(url.endsWith('/updates/catalog')) return {data:{recipients:[{...recipient,recordedSigningAuthority}]}};
    if(url.endsWith('/catalog')) return {data:{recipients:[recipient],documents:[]}};
    if(url.endsWith('/preview/smart/smart-disclosure')) return {data:{context:{contentHash:'a'.repeat(40)}}};
    throw new Error('Unexpected request '+url);
  });
  api.post.mockResolvedValue({data:{assigned:true}});
  wrapper=mount(Modal,{props:{...props,inline:true,clinicalMode:'full',recipientGuardianId:3}});
  await flushPromises();
  await button('Assign provider disclosure').trigger('click');
  await flushPromises();
  if(recordedSigningAuthority){
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/clients/5/updates/smart-form',expect.objectContaining({
      key:'smart-disclosure',recipient:{id:3,kind:'guardian'},useRecordedAuthority:true,contentHash:'a'.repeat(40)
    }));
    expect(wrapper.text()).toContain('Provider disclosure assigned in the portal.');
  }else{
    expect(api.post).not.toHaveBeenCalled();
    expect(wrapper.get('.review-selection').text()).toContain('Assigned provider disclosure');
    expect(button('Assign in portal').attributes('disabled')).toBeDefined();
  }
});

it('assigns a general release with the selected chart contact and leaves the signer pinned', async () => {
  api.get.mockImplementation(async url => {
    if (url.endsWith('/status')) return {data:{enabled:true}};
    if (url==='/clinical-forms') return {data:{plans:[]}};
    if (url.endsWith('/updates/catalog')) return {data:{recipients:[recipient]}};
    if (url.endsWith('/contacts')) return {data:{items:[{id:12,isActive:true,contact:{isActive:true,fullName:'External Contact'}}]}};
    if (url.endsWith('/catalog')) return {data:{recipients:[recipient],documents:[]}};
    throw new Error('Unexpected request '+url);
  });
  api.post.mockResolvedValue({data:{assignedCount:1}});
  wrapper=mount(Modal,{props:{...props,inline:true,clinicalMode:'full',recipientGuardianId:3}});
  await flushPromises();
  await button('Select individual items').trigger('click');
  const release = wrapper.findAll('.pick-row').find(row=>row.text().startsWith('Release of information'));
  await release.get('input').setValue(true);
  await flushPromises();
  await wrapper.get('.release-recipient select').setValue(12);
  await wrapper.get('.review-selection > label input[type=checkbox]').setValue(true);
  await button('Assign in portal').trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenCalledExactlyOnceWith('/enrollment-portal/clients/5/assignments',expect.objectContaining({
    recipient:{id:3,kind:'guardian'},authorityConfirmed:true,documents:[{release:true,contactId:12}]
  }));
});
