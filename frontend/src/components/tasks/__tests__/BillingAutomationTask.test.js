import {expect,it,vi} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn().mockResolvedValue({data:[]}),put:vi.fn()}}));
vi.mock('../../../store/activeTaskDock',()=>({useActiveTaskDockStore:()=>({pinTask:vi.fn()})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'itsco'}})}));
vi.mock('../PaperPacketTaskAction.vue',()=>({default:{template:'<div />'}}));
import Panel from '../TaskDetailSidePanel.vue';
it('links an urgent automatic-billing exception to its exact agency and claim',async()=>{
 const item={id:4,task_type:'custom',task_list_id:16,title:'Review held claim',status:'pending',urgency:'high',assigned_to_agency_id:377,source_ref_type:'billing_claim_followup',metadata:{clientId:15,claimId:19}};
 const w=shallowMount(Panel,{props:{item,agencyId:377},global:{stubs:{RouterLink:{name:'RouterLink',props:['to'],template:'<a><slot/></a>'}}}});await flushPromises();
 expect(w.text()).toContain('daily billing worker found an issue');
 const link=w.findAllComponents({name:'RouterLink'}).find(c=>c.text()==='Review held claim');
 expect(link.props('to')).toMatchObject({query:{agencyId:377,claimId:19}});w.unmount();
});
