import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),route:null}));
vi.mock('../../../services/api',()=>({default:{get:m.get}}));
vi.mock('vue-router',()=>({useRoute:()=>m.route}));
vi.mock('../../PublicIntakeSigningView.vue',()=>({default:{props:['applicationPublicKey','hiringContext'],template:'<div class="application-form">{{applicationPublicKey}} / {{hiringContext.jobId}}</div>'}}));
import View from '../PublicJobApplicationView.vue';
const data={agency:{id:463,name:'Juniper',plotlineOnly:true},jobs:[{jobId:42,title:'QA consulting role',applicationPublicKey:'published-job-key'}]};
beforeEach(()=>{vi.clearAllMocks();m.route=reactive({params:{agencySlug:'juniper',jobId:'42'}});m.get.mockResolvedValue({data});});
it('opens the selected company/job application with Plotline branding and no guessed application key',async()=>{
 const w=mount(View,{global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(m.get).toHaveBeenCalledWith('/public-intake/careers/juniper');
 expect(w.get('.application-form').text()).toBe('published-job-key / 42');
 expect(w.text()).toContain('A People Operations Platform');w.unmount();
});
it('does not open a different or closed job',async()=>{
 m.route.params.jobId='43';const w=mount(View,{global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.find('.application-form').exists()).toBe(false);expect(w.text()).toContain('no longer accepting');w.unmount();
});
it('discards a late response for another company',async()=>{
 let finish;m.get.mockImplementationOnce(()=>new Promise(resolve=>finish=resolve));
 const w=mount(View,{global:{stubs:{RouterLink:true}}});m.route.params.agencySlug='maple';m.get.mockResolvedValue({data:{agency:{id:464,name:'Maple'},jobs:[]}});await flushPromises();
 finish({data});await flushPromises();expect(w.find('.application-form').exists()).toBe(false);expect(w.text()).not.toContain('published-job-key');w.unmount();
});
