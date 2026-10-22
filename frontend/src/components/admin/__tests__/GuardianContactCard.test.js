import { it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Card from '../GuardianContactCard.vue';
import api from '../../../services/api';
import {openEmailComposer} from '../../../utils/emailComposerWindow';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
vi.mock('../../../utils/emailComposerWindow',()=>({openEmailComposer:vi.fn()}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'itsco'}}),useRouter:()=>({})}));
it('sends one parent email with both explicitly selected client records',async()=>{
 api.get.mockResolvedValue({data:{guardian:{id:30,name:'Demo Parent',email:'parent@example.test'},clients:[{id:1,name:'Child One',agencyId:2,agencyName:'ITSCO'},{id:2,name:'Child Two',agencyId:2,agencyName:'ITSCO'}]}});
 const w=mount(Card,{props:{guardianId:30,clientId:1,showAccountLink:true},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.find('input').element.checked).toBe(true);
 await w.findAll('input')[1].setValue(true);await w.find('button').trigger('click');
 expect(openEmailComposer).toHaveBeenCalledWith(expect.anything(),{mode:'new',agencyId:2,to:'parent@example.test',clientIds:'1,2'});
 expect(w.find('router-link-stub').attributes('to')).toBe('/itsco/guardian-contacts/30');w.unmount();
});
it('does not allow sending without a selected client from the guardian account',async()=>{
 api.get.mockResolvedValue({data:{guardian:{id:30,name:'Demo Parent',email:'parent@example.test'},clients:[{id:1,name:'Child One',agencyId:2,agencyName:'ITSCO'}]}});
 const w=mount(Card,{props:{guardianId:30},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.find('button').attributes('disabled')).toBeDefined();w.unmount();
});
