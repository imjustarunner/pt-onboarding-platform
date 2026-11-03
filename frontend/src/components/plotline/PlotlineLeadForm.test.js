import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const route = vi.hoisted(() => ({query:{}}));
vi.mock('vue-router', () => ({useRoute:()=>route}));
import Form from './PlotlineLeadForm.vue';
let wrapper;
beforeEach(() => { route.query={};vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({id:'fixture-request'})}))); });
afterEach(() => { wrapper?.unmount();vi.unstubAllGlobals(); });
it('preselects People Operations and carries it through the existing business inquiry', async() => {
  route.query={topic:'people-operations'};wrapper=mount(Form,{global:{stubs:{RouterLink:true}}});
  expect(wrapper.findAll('select')[2].element.value).toBe('People Operations');
  await wrapper.find('input[autocomplete="organization"]').setValue('Example Organization');
  await wrapper.find('input[autocomplete="given-name"]').setValue('Example');
  await wrapper.find('input[autocomplete="family-name"]').setValue('Visitor');
  await wrapper.find('input[type="email"]').setValue('visitor@example.test');
  await wrapper.find('input[type="tel"]').setValue('5550100100');
  await wrapper.findAll('select')[0].setValue('other');
  await wrapper.find('textarea').setValue('Please help our team with onboarding.');
  await wrapper.find('input[type="checkbox"]').setValue(true);
  await wrapper.find('form').trigger('submit');await flushPromises();
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url,request]=fetch.mock.calls[0];expect(url).toBe('/api/public/marketing-pages/ptco/business/requests');
  expect(JSON.parse(request.body)).toMatchObject({services:['people'],goals:'Plotline website · People Operations\nPlease help our team with onboarding.'});
});
it.each([['standalone','Standalone plan'],['connected','Connected plan'],['suite','Suite plan']])('retains the existing %s plan selection without a service topic', (plan,label) => {
  route.query={plan};wrapper=mount(Form,{global:{stubs:{RouterLink:true}}});expect(wrapper.findAll('select')[2].element.value).toBe(label);
});
