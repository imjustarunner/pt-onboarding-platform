import { flushPromises,mount } from '@vue/test-utils';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import ShareDialog from '../../enrollment/ClinicalDocumentShareDialog.vue';
import RequestView from '../../../views/public/ClinicalDocumentRequestView.vue';

const first={key:'user:20',userId:20,name:'Synthetic parent A',kind:'guardian',portal:'setup',emailHint:'a…@example.invalid'};
const second={key:'user:22',userId:22,name:'Synthetic parent B',kind:'guardian',portal:'active',emailHint:'b…@example.invalid'};
const firstItem={key:'41:foundation:portal-psc-17',clientId:41,clientName:'Synthetic child A',title:'Parent questionnaire',action:'complete'};
const siblingItem={key:'42:foundation:portal-psc-17',clientId:42,clientName:'Synthetic child B',title:'Parent questionnaire',action:'complete'};
const api={post:vi.fn(),get:vi.fn()};
let wrapper;
beforeEach(()=>{api.post.mockReset();api.get.mockReset();});
afterEach(()=>{wrapper?.unmount();vi.unstubAllGlobals();history.replaceState({},'','/');});

it('offers only eligible channels and allows distinct parent-by-child selections',async()=>{
  api.get.mockResolvedValue({data:{clients:[{id:42,name:siblingItem.clientName}]}});
  const optionsA=(item)=>({key:item.key,channels:{email:true,portal:true,sms:false}});
  const optionsB=(item)=>({key:item.key,channels:{email:true,portal:true,sms:true}});
  api.post.mockImplementation(async(path,payload)=>{
    if(path.endsWith('/send'))return {data:{requests:[{id:1,recipient:first.name,portal:true,deliveries:[{id:1,channel:'email',state:'sent'}]}]}};
    const items=payload.documents.length>1?[firstItem,siblingItem]:[firstItem];
    return {data:{items,recipients:[{...first,items:items.map(optionsA)},{...second,items:items.map(optionsB)}]}};
  });
  wrapper=mount(ShareDialog,{props:{clientId:41,agencyId:2,documents:[{foundationKey:'portal-psc-17',instrumentId:'psc-17',title:firstItem.title}]},
    global:{provide:{clinicalFormsHttp:api},stubs:{Teleport:true}}});
  await flushPromises();
  const a=()=>wrapper.findAll('fieldset')[0],b=()=>wrapper.findAll('fieldset')[1];
  a().get('legend input').element.checked=true;
  await a().get('legend input').trigger('change');
  await flushPromises();
  expect(api.get).toHaveBeenCalled();
  expect(a().findAll('option').map(option=>option.text())).not.toContain('Text direct link');
  await a().get('select').setValue('portal');
  expect(a().text()).toContain('hasn’t signed in');
  const addSibling=a().get('.item-choices label:last-child input');
  addSibling.element.checked=true;
  await addSibling.trigger('change');
  await flushPromises();
  expect(a().text()).toContain(siblingItem.clientName);
  await a().get('select').setValue('email');
  b().get('legend input').element.checked=true;
  await b().get('legend input').trigger('change');
  await flushPromises();
  await b().get('select').setValue('sms');
  for(const input of wrapper.findAll('form > label input'))await input.setValue(true);
  await wrapper.get('form').trigger('submit');
  await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/clinical-document-requests/clients/41/send',expect.objectContaining({
    recipients:[{key:first.key,items:[firstItem.key,siblingItem.key],mode:'email'},{key:second.key,items:[firstItem.key],mode:'sms'}]
  }));
});

it('opens a guest request only after the recipient acts and removes the credential from the address bar',async()=>{
  const token='a'.repeat(64);
  history.replaceState({},'','/sign/documents#'+token);
  const response=data=>({ok:true,json:async()=>data});
  const fetch=vi.fn().mockResolvedValueOnce(response({ready:true})).mockResolvedValueOnce(response({
    branding:{name:'Synthetic Agency'},items:[{id:6,title:'Release of information',action:'complete',completed:false}]
  })).mockResolvedValueOnce(response({
    type:'form',action:'complete',completed:false,plan:{version:1,template:{title:'Release of information',key:'release-of-information',sections:[]},data:{personLabel:'Synthetic client'}}
  }));
  vi.stubGlobal('fetch',fetch);
  wrapper=mount(RequestView,{global:{stubs:{SafetyPlanDocument:true,SafetyPlanSigning:true}}});
  await flushPromises();
  expect(fetch).not.toHaveBeenCalled();
  expect(location.hash).toBe('');
  await wrapper.get('button').trigger('click');
  await flushPromises();
  expect(fetch).toHaveBeenCalledWith('/api/public/clinical-document-requests/redeem',expect.objectContaining({method:'POST',body:JSON.stringify({token})}));
  expect(wrapper.text()).toContain('Synthetic Agency');
  expect(wrapper.find('safety-plan-signing-stub').exists()).toBe(true);
});
