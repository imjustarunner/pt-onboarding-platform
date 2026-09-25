import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
const http=vi.hoisted(()=>Object.assign(()=>{}, {get:vi.fn(),post:vi.fn(),put:vi.fn()}));
vi.mock('../../services/api',()=>({default:http}));
vi.mock('axios',()=>({default:{create:()=>http}}));
import Family from '../FamilyCommandCenterView.vue';
let wrapper,reads;
const home={household:{id:7,name:'Test family',timezone:'America/Denver',role:'parent'},members:[{user_id:1,display_name:'Dad'}],entries:[],work:[],activity:[],balances:[]};
beforeEach(()=>{
 vi.clearAllMocks();reads=0;
 http.get.mockImplementation(async path=>{
  if(path==='/me')return {data:{userId:1,households:[{id:7,name:'Test family',role:'parent'}]}};
  if(path==='/households/7'){if(++reads>1)return new Promise(()=>{});return {data:structuredClone(home)};}
  return {data:{events:[]}};
 });http.post.mockResolvedValue({data:{id:42}});
});
afterEach(()=>{wrapper?.unmount();delete window.SpeechRecognition;});
const add=async()=>{await wrapper.findAll('button').find(b=>b.text().includes('Add event')).trigger('click');await flushPromises();};
describe('manual family events remain usable',()=>{
 it('finishes saving and allows another event while the post-save dashboard request is stalled',async()=>{
  wrapper=shallowMount(Family,{global:{stubs:{FamilyVoiceEvent:false}}});await flushPromises();await add();
  await wrapper.find('.fcc-modal input[placeholder="Give it a name"]').setValue('First plan');
  await wrapper.find('.fcc-modal form').trigger('submit');await flushPromises();
  expect(wrapper.find('.fcc-modal').exists()).toBe(false);expect(reads).toBe(2);
  await add();expect(wrapper.find('.fcc-modal .fcc-primary').attributes('disabled')).toBeUndefined();
  await wrapper.find('.fcc-modal input[placeholder="Give it a name"]').setValue('Second plan');
  await wrapper.find('.fcc-modal form').trigger('submit');await flushPromises();
  expect(http.post).toHaveBeenCalledTimes(2);expect(wrapper.find('.fcc-modal').exists()).toBe(false);
 });
 it('can save manually while speech is awaiting permission and aborts capture before saving',async()=>{
  let rec;window.SpeechRecognition=class{constructor(){rec=this;}start(){}abort=vi.fn();};
  wrapper=shallowMount(Family,{global:{stubs:{FamilyVoiceEvent:false}}});await flushPromises();await add();
  await wrapper.find('.voice-toggle').trigger('click');await wrapper.find('.voice-mic').trigger('click');
  expect(wrapper.find('.voice-mic').text()).toContain('Stop listening');
  expect(wrapper.find('.fcc-modal .fcc-primary').attributes('disabled')).toBeUndefined();
  await wrapper.find('.fcc-modal input[placeholder="Give it a name"]').setValue('Manual plan');
  await wrapper.find('.fcc-modal form').trigger('submit');await flushPromises();
  expect(rec.abort).toHaveBeenCalled();expect(http.post).toHaveBeenCalledTimes(1);expect(wrapper.find('.fcc-modal').exists()).toBe(false);
 });
});
