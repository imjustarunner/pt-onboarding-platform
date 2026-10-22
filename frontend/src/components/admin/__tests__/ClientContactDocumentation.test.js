import {it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Tab from '../clientChart/ClientMessagesTab.vue';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(async()=>({data:[{id:1,category:'contact',is_internal_only:1,author_name:'Halle',message:'Guardian replied. Contact successful.'}]}))}}));
it('shows authorized contact documentation to a provider without enabling admin note creation',async()=>{
 const w=mount(Tab,{props:{clientId:1,isBackofficeRole:false}});await flushPromises();
 expect(w.text()).toContain('Contact documentation');expect(w.text()).toContain('Guardian replied. Contact successful.');
 expect(w.text()).not.toContain('New admin note');w.unmount();
});
