import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:m.get,post:m.post}}));
import Component from '../ProviderUpdateAmendment.vue';
beforeEach(()=>vi.clearAllMocks());
it('finishes the employee step immediately after signing without waiting for the countersigner',async()=>{
 const amendment={signed:false,countersigned:false,draft:false,countersignerName:'Agency Signer',html:'<p>Agreement</p>'};
 m.get.mockImplementation(async()=>({data:{amendment:{...amendment}}}));
 m.post.mockImplementation(async url=>{if(url.endsWith('/sign'))amendment.signed=true;return {data:{}};});
 const w=mount(Component,{props:{base:'/provider-update/test',agencyId:2},global:{stubs:{SignaturePad:{template:'<button @click="$emit(\'signed\',\'drawn-signature\')">Draw test signature</button>'}}}});await flushPromises();
 for(const box of w.findAll('input[type=checkbox]'))await box.setValue(true);
 await w.findAll('button').find(b=>b.text()==='Draw test signature').trigger('click');
 await w.findAll('button').find(b=>b.text()==='Sign my amendment').trigger('click');await flushPromises();
 expect(w.emitted('complete')).toEqual([[{amendmentSigned:true}]]);
 expect(w.text()).toContain('Your part is complete');expect(w.text()).not.toContain('Mark amendment step complete');w.unmount();
});
it('does not complete a step when the signature fails',async()=>{
 m.get.mockResolvedValue({data:{amendment:{signed:false,draft:false,html:'Agreement'}}});m.post.mockRejectedValue(Error('Failed'));
 const w=mount(Component,{props:{base:'/provider-update/test',agencyId:2},global:{stubs:['SignaturePad']}});await flushPromises();
 const state=w.vm.$.setupState;state.consent=true;state.intent=true;state.signature='drawn-signature';await state.sign();await flushPromises();
 expect(w.emitted('complete')).toBeUndefined();expect(w.find('[role=alert]').exists()).toBe(true);w.unmount();
});
