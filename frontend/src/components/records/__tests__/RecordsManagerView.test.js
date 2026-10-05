import { shallowMount,flushPromises } from '@vue/test-utils';
import { it,expect,vi } from 'vitest';
import RecordsManagerView from '../../../views/RecordsManagerView.vue';
import { api } from '../api.js';
vi.mock('vue-router',()=>({useRoute:()=>({query:{agencyId:'10'}})}));
vi.mock('../api.js',()=>({api:vi.fn()}));
it('keeps both backups when saving manager configuration',async()=>{
 const roster=[{id:11,name:'Primary'},{id:12,name:'Backup One'},{id:13,name:'Backup Two'}];
 api.mockImplementation(async(path,options)=>options?.method==='PUT'?{saved:true}:path==='/context'?{practices:[{id:10,name:'Practice',slug:'practice',canManage:1,canConfigure:1}]}:{managers:roster,candidates:roster,canConfigure:true,settings:{managerIds:[11,12,13],followUpDays:7,enabled:true,revision:2}});
 const w=shallowMount(RecordsManagerView);await flushPromises();
 expect(w.findAll('input[type="checkbox"]').filter(i=>i.element.checked)).toHaveLength(3);
 await w.find('form').trigger('submit');await flushPromises();
 expect(api).toHaveBeenCalledWith('/practices/10/options',{method:'PUT',body:{managerIds:[11,12,13],followUpDays:7,enabled:true,revision:2}});
});
