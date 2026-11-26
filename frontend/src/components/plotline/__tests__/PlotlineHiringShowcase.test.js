// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createRouter,createMemoryHistory} from 'vue-router';
import Showcase from '../PlotlineHiringShowcase.vue';
import LeadForm from '../PlotlineLeadForm.vue';
const stubs={RouterLink:{props:['to'],template:'<a :href="typeof to===\'string\'?to:to.path"><slot/></a>'}};
let wrapper;
beforeEach(()=>{
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
});
afterEach(()=>{wrapper?.unmount();wrapper=null;vi.unstubAllGlobals();});
describe('Plotline hiring presentation',()=>{
 it('presents both supplied fictional interview perspectives and supports keyboard selection',async()=>{
  wrapper=mount(Showcase,{global:{stubs}});
  expect(wrapper.get('#interview-platform .pl-real-example figcaption').text()).toContain('supplied interview mockup');
  await wrapper.get('[role=tablist]').trigger('keydown',{key:'ArrowRight'});
  expect(wrapper.findAll('[role=tab]')[1].attributes('aria-selected')).toBe('true');
  expect(wrapper.get('#interview-platform .pl-example-open img').attributes('src')).toContain('interview-applicant-mockup.png');
  expect(wrapper.get('#interview-platform .pl-real-example figcaption').text()).toContain('supplied applicant mockup');
  await wrapper.get('#interview-platform .pl-example-open').trigger('click');
  expect(wrapper.get('#interview-platform dialog').attributes('open')).toBeDefined();
  expect(wrapper.get('#interview-platform dialog').text()).toContain('not a live meeting or a production-record capture');
  await wrapper.get('#interview-platform [aria-label="Close product example"]').trigger('click');
  expect(wrapper.get('#interview-platform dialog').attributes('open')).toBeUndefined();
 });
 it('shows the updated reference and pre-hire stories and changes the pre-hire screen locally',async()=>{
  wrapper=mount(Showcase,{global:{stubs}});
  expect(wrapper.get('#professional-references').text()).toContain('without receiving its answers or ratings');
  expect(wrapper.get('#professional-references .pl-example-open img').attributes('src')).toContain('references-detail.png');
  expect(wrapper.get('#professional-references dialog img').attributes('src')).toContain('references.png');
  expect(wrapper.get('#pre-hire-portal').text()).toContain('People Operations review');
  const buttons=wrapper.findAll('#pre-hire-portal .pl-hiring-tabs button');
  await buttons[1].trigger('click');
  expect(wrapper.get('#pre-hire-portal .pl-example-open img').attributes('src')).toContain('prehire-review.png');
  await buttons[0].trigger('click');
  expect(wrapper.get('#pre-hire-portal .pl-example-open img').attributes('src')).toContain('prehire-home.png');
  expect(wrapper.findAll('input,textarea,form')).toHaveLength(0);
 });
 it('keeps the homepage compact and links to the full feature sections',()=>{
  wrapper=mount(Showcase,{props:{compact:true},global:{stubs}});
  expect(wrapper.find('#professional-references').exists()).toBe(false);
  expect(wrapper.find('#pre-hire-portal').exists()).toBe(false);
  expect(wrapper.get('a[href="/plottline/product#professional-references"]').exists()).toBe(true);
  expect(wrapper.get('a[href="/plottline/product#pre-hire-portal"]').exists()).toBe(true);
 });
});
describe('Feature-specific inquiries reuse the established form',()=>{
 it.each([['interviews','Browser interviews'],['references','Professional references'],['prehire','Pre-hire portal'],['toString','Plotline walkthrough']])('preselects only the allowed interest %s',async(value,label)=>{
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/plottline/start',component:{template:'<div/>'}}]});
  await router.push('/plottline/start?interest='+value);
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  wrapper=mount(LeadForm,{global:{plugins:[router]}});await flushPromises();
  expect(wrapper.get('select[aria-label="What would you like to explore?"]').element.value).toBe(label);
  expect(fetch).not.toHaveBeenCalled();
 });
});
