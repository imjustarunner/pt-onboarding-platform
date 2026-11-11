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

it('does not auto-apply an earlier reusable signature after an email edit invalidates the disclosure',async()=>{
 const context={locale:'en',contentHash:'same',providers:[{id:9,fullName:'QA Provider'}]};
 const saved={locale:'en',contentHash:'same',signatureData:'OLD'};
 const wrapper=mount(Flow,{props:{publicKey:'qa',mode:'embedded',disclosureContext:context,savedCapture:saved,sessionSavedSignature:'NEW-OTHER-SECTION'},global:{stubs:{SignaturePad:true,AdaptiveSignatureCapture:true}}});
 expect(wrapper.vm.signatureData).toBe('OLD');
 await wrapper.setProps({savedCapture:null});
 expect(wrapper.vm.acknowledged).toBe(false);
 wrapper.vm.acknowledged=true;
 for(let index=0;index<6&&wrapper.vm.stage!=='sign';index++) {await wrapper.vm.goNext();await flushPromises();}
 expect(wrapper.vm.stage).toBe('sign');
 expect(wrapper.vm.signatureData).toBe('');
 await wrapper.vm.goNext();await flushPromises();
 expect(wrapper.emitted('captured')).toBeUndefined();
 await wrapper.get('.saved-sig-thumb').trigger('click');
 await wrapper.vm.goNext();await flushPromises();
 expect(wrapper.emitted('captured')[0][0].smartDisclosure.signatureData).toBe('NEW-OTHER-SECTION');
 wrapper.unmount();
});
