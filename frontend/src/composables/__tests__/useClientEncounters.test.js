import {expect,it,vi} from 'vitest';
import {effectScope,ref,nextTick} from 'vue';
import {flushPromises} from '@vue/test-utils';
import {useClientEncounters} from '../useClientEncounters.js';
import api from '../../services/api';
vi.mock('../../services/api',()=>({default:{get:vi.fn()}}));
it('keeps the session count and date attached to the selected child when responses arrive out of order',async()=>{
 let resolveFirst;api.get.mockImplementation(path=>path.includes('/1/')?new Promise(resolve=>resolveFirst=resolve):Promise.resolve({data:{encounters:[{id:20,service_date:'2026-11-10',note_status:'planned'}]}}));
 const scope=effectScope(),client=ref(1);const state=scope.run(()=>useClientEncounters(ref(450),client,{medicalOnly:true}));
 client.value=2;await nextTick();await flushPromises();expect(state.sessionCount.value).toBe(1);
 resolveFirst({data:{encounters:[{id:10,service_date:'2026-11-11'},{id:11,service_date:'2026-11-12'}]}});await flushPromises();
 expect(state.sessionCount.value).toBe(1);expect(state.lastSession.value.id).toBe(20);scope.stop();
});
