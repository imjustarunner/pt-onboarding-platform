import {mount,flushPromises} from '@vue/test-utils';
import {expect,it,vi} from 'vitest';
import ClientCommunicationsTab from '../ClientCommunicationsTab.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:8,role:'support'}})}));
it('keeps the selected sibling’s messages and preferences when an older request finishes last',async()=>{
 const pending={};api.get.mockImplementation(url=>new Promise(resolve=>{pending[url]=resolve;}));
 const w=mount(ClientCommunicationsTab,{props:{clientId:4},global:{stubs:{EmailThreadReader:true,ClientChartLiveCommunications:true}}});
 await w.setProps({clientId:5});
 const finish=(id,label)=>{
  pending[`/clients/${id}/communications`]({data:{items:[{id,channel:'email',subject:label,status:'sent'}],conversations:[],guardians:[],counts:{total:1,email:1,sms:0,opened:0,failed:0}}});
  pending[`/clients/${id}/demographics`]({data:{intakeCommunicationPreferences:{fields:[{key:'email',label:'Email',value:label}]}}});
  pending[`/clients/${id}/sms-audit`]({data:{items:[]}});
 };
 finish(5,'Selected sibling confirmation');await flushPromises();finish(4,'Old sibling confirmation');await flushPromises();
 expect(w.text()).toContain('Selected sibling confirmation');expect(w.text()).not.toContain('Old sibling confirmation');w.unmount();
});
