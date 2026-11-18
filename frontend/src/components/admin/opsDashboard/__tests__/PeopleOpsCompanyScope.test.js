import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../../services/api',()=>({default:{get:m.get}}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'juniper'}}),useRouter:()=>({push:vi.fn()})}));
import Card from '../PeopleOpsPipelineCard.vue';
let w;
beforeEach(()=>{vi.clearAllMocks();m.get.mockResolvedValue({data:{agencies:[{id:463,name:'Juniper'}],candidates:[]}});});
afterEach(()=>w?.unmount());
it('requests the chosen company and hides the aggregate switch',async()=>{
 w=mount(Card,{props:{agencyId:463}});await flushPromises();
 expect(m.get).toHaveBeenCalledWith('/hiring/pipeline-board',{params:{agencyId:463}});expect(w.text()).not.toContain('All agencies');
});
it('clears old company data and ignores a delayed response after a company switch',async()=>{
 let resolve; m.get.mockImplementationOnce(()=>new Promise(r=>resolve=r));
 w=mount(Card,{props:{agencyId:463}});await w.setProps({agencyId:464});await flushPromises();
 resolve({data:{agencies:[{id:463,name:'Juniper'}],candidates:[{userId:10,agencyId:463,firstName:'Private Juniper applicant',bucket:'newApplicants',tab:'needs'}]}});await flushPromises();
 expect(m.get).toHaveBeenLastCalledWith('/hiring/pipeline-board',{params:{agencyId:464}});expect(w.text()).not.toContain('Private Juniper applicant');
});
