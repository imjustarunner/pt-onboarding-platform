import {mount} from '@vue/test-utils';import {it,expect,vi} from 'vitest';
vi.mock('../../../services/api',()=>({default:{get:vi.fn().mockResolvedValue({data:[]})}}));
import Table from '../TasksListTable.vue';
it('identifies the existing completed masked-client task and its exact source without recreating it',async()=>{
 const task={id:2488,title:'Process paper packet enrollment: PerQap #2544',status:'completed',source_ref_type:'paper_packet_processing',source_ref_id:226,metadata:{clientId:2544,documentId:4396}};
 const w=mount(Table,{props:{tasks:[task]},global:{stubs:{TaskClaimButton:true,UserAvatar:true,BulkActionBar:true}}});expect(w.text()).toContain('Task #2488');expect(w.text()).toContain('Client #2544 · Document #4396');await w.get('.task-row').trigger('click');expect(w.emitted('open')).toEqual([[task]]);expect(w.emitted('toggle-complete')).toBeUndefined();w.unmount();
});
