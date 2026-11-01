import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import {ref} from 'vue';
import Component from '../GuardianContactSharing.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
vi.mock('../../../composables/useFamilyLocale',()=>({useFamilyLocale:()=>({locale:ref('en')})}));
const response={sharing:{name:true,email:true,phone:true},contacts:[{id:10,name:'Guardian',email:null,phone:'7195550100'}]};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:response});api.put.mockResolvedValue({data:response});});
it('allows each field to be unchecked independently and saves an explicit choice',async()=>{
  const w=mount(Component,{props:{clientId:20}});await flushPromises();
  const checks=w.findAll('input[type=checkbox]');expect(checks.map(c=>c.element.checked)).toEqual([true,true,true]);
  await checks[1].setValue(false);await w.find('form').trigger('submit');await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/guardian-portal/clients/20/contact-sharing',{sharing:{name:true,email:false,phone:true}});
  expect(w.text()).toContain('Sharing choices saved.');w.unmount();
});
it('does not display stale contact details when switching dependents',async()=>{
  const w=mount(Component,{props:{clientId:20}});await flushPromises();
  api.get.mockReturnValue(new Promise(()=>{}));await w.setProps({clientId:21});
  expect(w.text()).not.toContain('7195550100');expect(w.find('form').exists()).toBe(false);w.unmount();
});
