import {it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Card from '../SupervisionAgreementCard.vue';
it('sends the reviewed agreement from the visible Sign button and prevents duplicate submissions',async()=>{
 let complete;const http={post:vi.fn(()=>new Promise(resolve=>{complete=resolve;}))};
 const agreement={id:413,myRole:'supervisee',documentHash:'reviewed-hash',html:'<p>Agreement</p>',document:{agencyName:'ITSCOLLC',parties:[{name:'Alex QA'},{name:'Cameron QA'}]}};
 const w=mount(Card,{props:{agreement,http}});expect(w.text()).toContain('#413');
 const button=w.find('button.btn-primary');expect(button.attributes('disabled')).toBeDefined();
 await w.find('input[type=checkbox]').setValue(true);await w.find('input.typed').setValue('Alex QA');await button.trigger('click');await w.find('form').trigger('submit');
 expect(http.post).toHaveBeenCalledOnce();expect(http.post).toHaveBeenCalledWith('/supervision/agreements/413/sign',{accepted:true,typedName:'Alex QA',signatureData:null,documentHash:'reviewed-hash'});
 complete({data:{complete:true}});await flushPromises();expect(w.emitted('signed')).toEqual([[{complete:true}]]);w.unmount();
});
