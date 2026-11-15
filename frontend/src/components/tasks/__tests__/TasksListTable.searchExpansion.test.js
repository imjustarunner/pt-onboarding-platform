import {it,expect,vi} from 'vitest';
import {shallowMount} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
import Table from '../TasksListTable.vue';
it('opens the completed group for a search, including a table mounted after search results arrive',async()=>{
 const task={id:2488,title:'Process paper packet · PerQap#2544',status:'completed',assigned_to_role:'support',metadata:{clientId:2544,documentId:4396}};
 const w=shallowMount(Table,{attachTo:document.body,props:{tasks:[task],currentUserId:1434}});
 expect(w.get('.task-group--completed .task-group__body').isVisible()).toBe(false);
 await w.setProps({searchQuery:'2488'});
 expect(w.get('.task-group--completed .task-group__body').isVisible()).toBe(true);
 const row=w.get('.task-group--completed .task-row');await row.trigger('click');
 expect(w.emitted('open')[0][0].id).toBe(2488);w.unmount();
 const loaded=shallowMount(Table,{attachTo:document.body,props:{tasks:[task],searchQuery:'2488',currentUserId:1434}});
 expect(loaded.get('.task-group--completed .task-group__body').isVisible()).toBe(true);loaded.unmount();
});
