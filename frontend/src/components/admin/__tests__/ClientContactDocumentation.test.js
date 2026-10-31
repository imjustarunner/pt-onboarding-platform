import {it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Tab from '../clientChart/ClientMessagesTab.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(async()=>({data:[{id:1,category:'contact',is_internal_only:1,author_name:'Halle',message:'Guardian replied. Contact successful.'}]}))}}));
it('shows authorized contact documentation to a provider without enabling admin note creation',async()=>{
 const w=mount(Tab,{props:{clientId:1,isBackofficeRole:false}});await flushPromises();
 expect(w.text()).toContain('Contact documentation');expect(w.text()).toContain('Guardian replied. Contact successful.');
 expect(w.text()).not.toContain('New admin note');
 expect(w.text()).not.toContain('Client-facing notes');
 expect(w.text()).not.toContain('Use initials only');
 expect(w.find('textarea').exists()).toBe(false);w.unmount();
});
it('retains previously authorized shared account notes as read-only history',async()=>{
 api.get.mockResolvedValueOnce({data:[{id:2,is_internal_only:0,message:'Existing account update.'}]});
 const w=mount(Tab,{props:{clientId:1,isBackofficeRole:false}});await flushPromises();
 expect(w.find('details').exists()).toBe(true);expect(w.find('details').attributes('open')).toBeUndefined();
 expect(w.text()).toContain('Existing account update.');expect(w.find('textarea').exists()).toBe(false);w.unmount();
});
