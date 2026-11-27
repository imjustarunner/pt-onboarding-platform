// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createRouter,createMemoryHistory} from 'vue-router';
import Pricing from '../PlotlinePricing.vue';
import LeadForm from '../PlotlineLeadForm.vue';
const stubs={RouterLink:{props:['to'],computed:{href(){return typeof this.to==='string'?this.to:this.to.path+'?'+new URLSearchParams(this.to.query).toString();}},template:'<a :href="href"><slot/></a>'}};
let wrapper;
afterEach(()=>{wrapper?.unmount();wrapper=null;vi.unstubAllGlobals();});
describe('Plotline activity and employee pricing',()=>{
 it('offers the bounded guided pilot and shows a recurring default without paid onboarding',()=>{
  wrapper=mount(Pricing,{global:{stubs}});
  expect(wrapper.get('a[href="/plottline/start?plan=pilot"]').text()).toBe('Request my five-interview pilot');
  expect(wrapper.get('.pl-pilot').text()).toContain('30-day guided pilot');
  expect(wrapper.get('.pl-pilot').text()).toContain('no automatic paid conversion');
  expect(wrapper.get('.pl-quote>strong').text()).toBe('$30');
  expect(wrapper.get('.pl-quote-breakdown').text()).toContain('One-time onboarding fees (0)$0');
 });
 it('separates a one-time onboarding fee from the next month and carries the estimate into inquiry',async()=>{
  wrapper=mount(Pricing,{props:{startPath:'/start'},global:{stubs}});
  await wrapper.findAll('.pl-estimate-scenarios button')[0].trigger('click');
  expect(wrapper.get('.pl-quote>strong').text()).toBe('$81');
  expect(wrapper.get('.pl-quote').text()).toContain('next month’s recurring platform estimate is $29');
  expect(wrapper.get('.pl-quote .pl-button').attributes('href')).toBe('/start?plan=usage&employees=5&screenings=10&interviewMinutes=60&onboardings=1');
  await wrapper.findAll('.pl-estimate-scenarios button')[2].trigger('click');
  expect(wrapper.get('.pl-quote>strong').text()).toBe('$1,102.50');
 });
 it('prevents invalid counts from producing a requestable estimate',async()=>{
  wrapper=mount(Pricing,{global:{stubs}});
  await wrapper.get('input[type=number]').setValue('1.5');
  expect(wrapper.find('.pl-quote>strong').exists()).toBe(false);
  expect(wrapper.get('[role=alert]').text()).toContain('whole, nonnegative');
  expect(wrapper.find('.pl-quote .pl-button').exists()).toBe(false);
 });
});
async function lead(query){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/plottline/start',component:{template:'<div/>'}}]});
 await router.push({path:'/plottline/start',query});
 wrapper=mount(LeadForm,{global:{plugins:[router]}});await flushPromises();
}
describe('Pilot and estimate inquiries',()=>{
 it('preserves the complete quote and longest allowed message within the existing inquiry limit',async()=>{
  const fetch=vi.fn(async()=>({ok:true,json:async()=>({id:'fictional-long-quote'})}));vi.stubGlobal('fetch',fetch);
  await lead({plan:'usage',employees:'100000',screenings:'1000000',interviewMinutes:'1000000',onboardings:'1000000'});
  const textarea=wrapper.get('textarea');
  const limit=Number(textarea.attributes('maxlength'));
  expect(limit).toBeGreaterThan(0);expect(limit).toBeLessThan(750);
  const message='x'.repeat(limit);
  await textarea.setValue(message);
  await wrapper.get('form').trigger('submit');await flushPromises();
  const body=JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.goals).toHaveLength(1000);
  expect(body.goals.endsWith(message)).toBe(true);
  expect(body.goals).toContain('1000000 new completed onboardings');
 });
 it('keeps an oversized written message visible and sends no invalid inquiry',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await lead({plan:'usage',employees:'5',screenings:'10',interviewMinutes:'60',onboardings:'1'});
  const textarea=wrapper.get('textarea');
  const message='x'.repeat(Number(textarea.attributes('maxlength'))+1);
  await textarea.setValue(message);
  await wrapper.get('form').trigger('submit');await flushPromises();
  expect(fetch).not.toHaveBeenCalled();
  expect(textarea.element.value).toBe(message);
  expect(wrapper.get('[role=alert]').text()).toContain('so the complete estimate can be included');
 });
 it('opens a pilot request without initiating an account, trial or payment',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await lead({plan:'pilot'});
  expect(wrapper.get('select[aria-label="What would you like to explore?"]').element.value).toBe('Five-interview pilot');
  expect(fetch).not.toHaveBeenCalled();expect(wrapper.find('[aria-label="Your planning estimate"]').exists()).toBe(false);
 });
 it('recomputes and sends a valid quote summary through the existing mocked inquiry endpoint',async()=>{
  const fetch=vi.fn(async()=>({ok:true,json:async()=>({id:'fictional-quote'})}));vi.stubGlobal('fetch',fetch);
  await lead({plan:'usage',employees:'5',screenings:'10',interviewMinutes:'60',onboardings:'1',price:'0'});
  expect(wrapper.get('[aria-label="Your planning estimate"]').text()).toContain('$81 USD');
  for(const [selector,value] of [['input[autocomplete=organization]','Example Team'],['input[autocomplete=given-name]','Fake'],['input[autocomplete=family-name]','Visitor'],['input[type=email]','visitor@example.invalid'],['input[type=tel]','5550100000'],['textarea','Please help us get started.']])await wrapper.get(selector).setValue(value);
  await wrapper.findAll('select')[0].setValue('other');await wrapper.get('input[type=checkbox]').setValue(true);
  await wrapper.get('form').trigger('submit');await flushPromises();
  const [url,request]=fetch.mock.calls[0];expect(url).toBe('/api/public/marketing-pages/ptco/business/requests');
  const body=JSON.parse(request.body);expect(body.services).toEqual(['people']);expect(body.goals).toContain('one-time onboarding fees');expect(body.goals).toContain('$81 USD');expect(body.goals).toContain('Please help us get started.');
 });
 it('discards malformed quote inputs and unknown plan properties without displaying a price',async()=>{
  vi.stubGlobal('fetch',vi.fn());
  await lead({plan:'usage',employees:'-1',screenings:'2',interviewMinutes:'60',onboardings:'1'});
  expect(wrapper.find('[aria-label="Your planning estimate"]').exists()).toBe(false);
  wrapper.unmount();await lead({plan:'toString'});
  expect(wrapper.get('select[aria-label="What would you like to explore?"]').element.value).toBe('Plotline walkthrough');
 });
});
