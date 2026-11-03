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

it('does not carry acknowledgment or signature from English into a Spanish disclosure edition', async () => {
 const en = { locale: 'en', contentHash: 'en-hash', providers: [{ id: 9, fullName: 'Demo Provider' }], sections: [{ id: 'intro', html: '<p>This document</p>' }] };
 const savedCapture = { locale: 'en', contentHash: 'en-hash', signatureData: 'demo-signature', acknowledged: true };
 const wrapper = mount(Flow, { props: { publicKey: 'qa', mode: 'embedded', locale: 'en', disclosureContext: en, savedCapture }, global: { stubs: { SignaturePad: true, AdaptiveSignatureCapture: true } } });
 expect(wrapper.vm.signatureData).toBe('demo-signature');
 const es = { ...en, locale: 'es', contentHash: 'es-hash', sections: [{ id: 'intro', html: '<p>Este documento</p>' }] };
 await wrapper.setProps({ locale: 'es', disclosureContext: es });
 expect(wrapper.text()).toContain('Este documento');
 expect(wrapper.vm.acknowledged).toBe(false);
 expect(wrapper.vm.signatureData).toBe('');
 await wrapper.vm.goNext();
 expect(wrapper.emitted('captured')).toBeUndefined();
 wrapper.vm.acknowledged = true;
 wrapper.vm.signatureData = 'new-demo-signature';
 await wrapper.vm.submitDisclosure();
 expect(wrapper.emitted('captured')[0][0].smartDisclosure).toMatchObject({ locale: 'es', contentHash: 'es-hash', signatureData: 'new-demo-signature' });
 wrapper.unmount();
});
