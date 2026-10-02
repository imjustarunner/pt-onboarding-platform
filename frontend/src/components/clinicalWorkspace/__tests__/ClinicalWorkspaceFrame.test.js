import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import Frame from '../ClinicalWorkspaceFrame.vue';
import Chart from '../../admin/clientChart/ClientChartShell.vue';
import { clinicalWorkspaceActive } from '../../../composables/useClinicalWorkspace.js';
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: {id:7,name:'Test tenant'}, agencies:[],userAgencies:[] }) }));
async function mountView(component, options={}) {
  const router=createRouter({history:createMemoryHistory(), routes:[{path:'/:pathMatch(.*)*',component:{template:'<div />'}}]});
  await router.push('/tenant/note-aid');
  return mount(component, {...options, global:{plugins:[router]}});
}
describe('clinical workspace frame', () => {
  it('takes over the page and restores app navigation when returning to the tenant dashboard', async () => {
    const notes = defineComponent({ components: { Frame }, template: '<Frame immersive return-label="Back to app">Practice Notes</Frame>' });
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/:organizationSlug/note-aid', component: notes },
      { path: '/:organizationSlug/dashboard', component: { template: '<p>My Dashboard</p>' } }
    ] });
    const shell = defineComponent({
      setup: () => ({ clinicalWorkspaceActive }),
      template: '<nav v-if="!clinicalWorkspaceActive" aria-label="App navigation">App navigation</nav><router-view />'
    });
    await router.push('/tenant/note-aid');
    const wrapper = mount(shell, { global: { plugins: [router] } });
    try {
      await flushPromises();
      expect(wrapper.find('[aria-label="App navigation"]').exists()).toBe(false);
      expect(wrapper.find('.clinical-workspace__back').text()).toBe('← Back to app');
      await wrapper.find('.clinical-workspace__back').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe('/tenant/dashboard');
      expect(wrapper.text()).toContain('My Dashboard');
      expect(wrapper.find('[aria-label="App navigation"]').exists()).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });
  it('changes branding without remounting draft content and cleans up immersive mode', async () => {
    const editor=defineComponent({setup:()=>({text:ref('')}),template:'<textarea v-model="text" />'});
    const wrapper=await mountView(Frame,{props:{immersive:true,switchable:true},slots:{default:editor}});
    expect(clinicalWorkspaceActive.value).toBe(true);
    await wrapper.find('textarea').setValue('Keep this draft');
    await wrapper.setProps({mode:'overview'});
    expect(wrapper.find('textarea').element.value).toBe('Keep this draft');
    expect(wrapper.classes()).not.toContain('auricwell-surface');
    expect(clinicalWorkspaceActive.value).toBe(false);
    await wrapper.setProps({mode:'clinical'});
    expect(clinicalWorkspaceActive.value).toBe(true);
    wrapper.unmount();
    expect(clinicalWorkspaceActive.value).toBe(false);
  });
  it('leaves tutoring content available with no clinical header or immersive chrome', async () => {
    const wrapper=await mountView(Frame,{props:{enabled:false,immersive:true},slots:{default:'Documentation tools'}});
    expect(wrapper.text()).toBe('Documentation tools');
    expect(wrapper.find('header').exists()).toBe(false);
    expect(clinicalWorkspaceActive.value).toBe(false);
    wrapper.unmount();
  });
  it('shows one workspace header for nested chart documentation', async () => {
    const wrapper=await mountView(defineComponent({components:{Frame},template:'<Frame><Frame context-label="Documentation Hub"><textarea /></Frame></Frame>'}));
    expect(wrapper.findAll('header')).toHaveLength(1);
    expect(wrapper.find('textarea').exists()).toBe(true);
    wrapper.unmount();
  });
  it('keeps embedded documentation in tenant mode when its parent switches views', async () => {
    const wrapper=await mountView(defineComponent({components:{Frame},setup:()=>({mode:ref('clinical')}),template:'<Frame :mode="mode" switchable @update:mode="mode=$event"><Frame immersive><textarea /></Frame></Frame>'}));
    expect(wrapper.findAll('.auricwell-surface')).toHaveLength(2);
    await wrapper.find('button[aria-pressed=false]').trigger('click');
    expect(wrapper.findAll('.auricwell-surface')).toHaveLength(0);
    expect(wrapper.findAll('header')).toHaveLength(1);
    expect(wrapper.find('textarea').exists()).toBe(true);
    expect(clinicalWorkspaceActive.value).toBe(false);
    wrapper.unmount();
  });
  it('preserves chart navigation, return events, and tutoring tabs', async () => {
    const wrapper=await mountView(Chart,{props:{clinicalBranding:true,fullPage:true,tabs:[{id:'overview',label:'Overview'},{id:'notes',label:'Notes'}]}, slots:{default:'Chart contents'}});
    await wrapper.findAll('[role=tab]')[1].trigger('click');
    expect(wrapper.emitted('update:activeTab')).toEqual([['notes']]);
    await wrapper.find('.clinical-workspace__back').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    await wrapper.setProps({clinicalBranding:false});
    expect(wrapper.findAll('[role=tab]')).toHaveLength(2);
    expect(wrapper.text()).toContain('Chart contents');
    expect(wrapper.text()).not.toContain('AuricWell');
    wrapper.unmount();
  });
});
