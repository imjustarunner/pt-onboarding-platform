import { expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Flow from '../SmartDisclosureFlow.vue';
vi.mock('../../../services/api',()=>({default:{post:vi.fn()}}));
it('blocks signing a disclosure whose provider list is empty',async()=>{
 const wrapper=mount(Flow,{props:{publicKey:'qa',mode:'embedded',disclosureContext:{providers:[]}},global:{stubs:{SignaturePad:true,AdaptiveSignatureCapture:true}}});
 wrapper.vm.acknowledged=true;wrapper.vm.signatureData='saved-signature';await flushPromises();
 await wrapper.vm.goNext();expect(wrapper.text()).toContain('provider disclosure is not ready');
 await wrapper.vm.submitDisclosure();expect(wrapper.emitted('captured')).toBeUndefined();wrapper.unmount();
});
it('allows reviewing a disclosure with its provider roster present',async()=>{
 const wrapper=mount(Flow,{props:{publicKey:'qa',mode:'embedded',disclosureContext:{providers:[{id:1433,fullName:'QA Provider'}]}},global:{stubs:{SignaturePad:true,AdaptiveSignatureCapture:true}}});
 wrapper.vm.acknowledged=true;await wrapper.vm.goNext();expect(wrapper.vm.error).toBe('');wrapper.unmount();
});
