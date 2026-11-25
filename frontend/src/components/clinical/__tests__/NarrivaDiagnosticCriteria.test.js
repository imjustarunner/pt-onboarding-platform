import {it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Criteria from '../NarrivaDiagnosticCriteria.vue';
it('keeps the optional criteria status off the writer’s diagnosis until they open the aid',async()=>{
 const w=mount(Criteria,{props:{diagnosis:{code:'F41.1'},saved:{id:8,criteria:[{id:'a',label:'Synthetic frequency requirement',kind:'frequency',group:'frequency',minimum:1,thresholdSourceValid:true,status:'unconfirmed'}]}}});
 expect(w.text()).toContain('optional');expect(w.find('.dx-criteria-status').exists()).toBe(false);
 await w.get('button').trigger('click');expect(w.get('.dx-criteria-status').text()).toContain('incomplete');expect(w.get('.criteria-evidence').text()).toContain('No supporting statement identified');w.unmount();
});
it('saves provider selections to the separate internal review endpoint without rewriting a note or justification',async()=>{
 const transport={post:vi.fn(async()=>({data:{id:9,code:'F41.1',criteria:[],internalOnly:true}}))};
 const w=mount(Criteria,{props:{agencyId:2,draftId:31,transport,diagnosis:{code:'F41.1'},saved:{id:8,criteria:[{id:'a',label:'Synthetic frequency requirement',kind:'frequency',group:'frequency',minimum:1,thresholdSourceValid:true,status:'unconfirmed',frequency:''}]}}});
 await w.get('button').trigger('click');await w.get('select').setValue('present');await w.get('input').setValue('More days than not, as assessed.');await w.get('input').trigger('change');
 await w.findAll('button').find(button=>button.text()==='Save internal review').trigger('click');await flushPromises();
 expect(transport.post).toHaveBeenCalledWith('/diagnosis-criteria',{action:'save',agencyId:2,draftId:31,icd10Code:'F41.1',reviewId:8,selections:[{id:'a',status:'present',frequency:'More days than not, as assessed.',duration:undefined}]},{skipGlobalLoading:true});
 expect(w.emitted('apply')).toBeUndefined();expect(w.get('[data-internal-review-only]').exists()).toBe(true);w.unmount();
});
