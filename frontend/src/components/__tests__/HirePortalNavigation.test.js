import {it,expect,vi,beforeEach} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
import Workspace from '../prehire/HirePortalWorkspace.vue';
const first={key:'first',kind:'acknowledgement',title:'First item',required:true},book={key:'book',kind:'handbook',title:'Workplace handbook',required:false},last={key:'review',kind:'review',title:'Final review'};
function mount(status='PREHIRE') {return shallowMount(Workspace,{props:{token:'test',http:{defaults:{baseURL:'/api'},get:vi.fn()},data:{candidate:{status,firstName:'Alex'},agency:{name:'ITSCO',slug:'itsco'},workflow:{steps:{pre_hire:[first,book,last],onboarding:[{...book,required:true},last]},progress:{pre_hire:{total:1,completed:0,percent:0}}}}}});}
beforeEach(()=>{Element.prototype.scrollIntoView=vi.fn();});
it('keeps the prehire handbook out of next/back and opens it separately without an acknowledgment',async()=>{
 const w=mount();w.vm.navigateToSteps();await flushPromises();
 expect(w.get('.steps').text()).not.toContain('Workplace handbook');
 await w.get('.step-actions .primary').trigger('click');await flushPromises();
 expect(w.get('.current-heading').text()).toContain('Final review');expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
 const link=w.findAll('.hire-nav button').find(b=>b.text().includes('Workplace handbook'));await link.trigger('click');await flushPromises();
 expect(w.get('.handbook-reference').text()).toContain('Optional reference');expect(w.find('.handbook-reference input[type=checkbox]').exists()).toBe(false);
});
it('retains the required handbook step during onboarding',async()=>{
 const w=mount('ONBOARDING');w.vm.navigateToSteps();await flushPromises();
 expect(w.get('.steps').text()).toContain('Workplace handbook');expect(w.get('.current-heading').text()).toContain('Workplace handbook');
});
it('places the handbook acknowledgement before the reader and saves the published edition',async()=>{
 const w=mount('ONBOARDING');w.vm.navigateToSteps();await flushPromises();
 const reader=w.findComponent({name:'WorkplaceHandbookPortal'});
 reader.vm.$emit('available',true);reader.vm.$emit('version',12);await flushPromises();
 const acknowledgement=w.get('.handbook-acknowledgement');
 expect(w.get('.resource-step').element.firstElementChild).toBe(acknowledgement.element);
 expect(acknowledgement.get('button').attributes('disabled')).toBeDefined();
 await acknowledgement.get('input[type=checkbox]').setValue(true);
 acknowledgement.findComponent({name:'AdaptiveSignatureCapture'}).vm.$emit('update:modelValue','synthetic-signature');
 await flushPromises();
 const post=vi.fn(async()=>({data:{ok:true}}));
 await w.setProps({http:{defaults:{baseURL:'/api'},get:vi.fn(),post}});
 await acknowledgement.get('button').trigger('click');await flushPromises();
 expect(post).toHaveBeenCalledWith('/prehire-portal/test/workflow/book',{acknowledged:true,signatureData:'synthetic-signature',handbookVersionId:12});
 expect(w.emitted('reload')).toHaveLength(1);w.unmount();
});
it('keeps acknowledgement unavailable until the reader confirms a published handbook',async()=>{
 const w=mount('ONBOARDING');w.vm.navigateToSteps();await flushPromises();
 expect(w.find('.handbook-acknowledgement').exists()).toBe(false);
 const reader=w.findComponent({name:'WorkplaceHandbookPortal'});
 reader.vm.$emit('available',false);reader.vm.$emit('version',null);await flushPromises();
 expect(w.find('.handbook-acknowledgement').exists()).toBe(false);w.unmount();
});
it('hides the optional sidebar reference once onboarding begins, including the archived pre-hire view',async()=>{
 const w=mount('ONBOARDING'); expect(w.findAll('.hire-nav button').some(b=>b.text().includes('Workplace handbook'))).toBe(false);
 await w.findAll('.hire-nav button').find(b=>b.text().includes('Pre-Hire')).trigger('click');
 expect(w.findAll('.hire-nav button').some(b=>b.text().includes('Workplace handbook'))).toBe(false);w.unmount();
});
