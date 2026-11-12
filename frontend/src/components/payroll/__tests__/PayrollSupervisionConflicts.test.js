// @vitest-environment jsdom
import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Panel from '../PayrollSupervisionConflicts.vue';
const api=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));vi.mock('../../../services/api',()=>({default:api}));
beforeEach(()=>vi.resetAllMocks());
it('shows both sources, waits for acknowledgement and resolves all codes sharing a provider/date',async()=>{
 api.get.mockResolvedValue({data:{rows:[{user_id:7,service_date:'2026-11-03',provider_name:'Test Provider',legacy_service_code:'99414',legacy_units_total:60,app_attended_minutes:50}]}});let finish;api.put.mockImplementation(()=>new Promise(r=>{finish=r}));const w=mount(Panel,{props:{periodId:12}});await flushPromises();expect(w.text()).toContain('Test Provider');await w.findAll('button').find(b=>b.text()==='Use app attendance').trigger('click');expect(w.emitted('changed')).toBeUndefined();expect(w.emitted('readiness').at(-1)[0].ready).toBe(false);finish({data:{ok:true}});await flushPromises();expect(w.text()).toContain('No unresolved supervision conflicts.');expect(w.emitted('changed')).toHaveLength(1);expect(api.put.mock.calls[0][1]).toMatchObject({userId:7,serviceDate:'2026-11-03',resolution:'use_app_attendance'});w.unmount();
});
it('keeps unavailable conflict data blocked rather than calling it clear',async()=>{api.get.mockRejectedValue(Error('Review unavailable'));const w=mount(Panel,{props:{periodId:12}});await flushPromises();expect(w.text()).toContain('Review unavailable');expect(w.text()).not.toContain('No unresolved');expect(w.emitted('readiness').at(-1)[0].ready).toBe(false);w.unmount();});
