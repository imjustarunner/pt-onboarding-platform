import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Component from '../DraftAppointmentRepair.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{linked:false,options:[{clinicalSessionId:166,appointmentId:104,startAt:'2026-10-28 16:00:00',sourceTimezone:'America/Denver',serviceCode:'90834'}]}});api.post.mockResolvedValue({data:{draft:{id:293,clinical_session_id:166}}});});
it('requires selection and explicit confirmation and waits for source saving before linking',async()=>{
 let finish;const beforeLink=vi.fn(()=>new Promise(resolve=>finish=resolve));
 const w=mount(Component,{props:{draftId:293,beforeLink}});await flushPromises();
 const link=()=>w.findAll('button').find(b=>b.text().includes('Link appointment'));
 expect(link().element.disabled).toBe(true);await w.find('select').setValue('166');await w.find('input').setValue(true);
 await link().trigger('click');await flushPromises();expect(api.post).not.toHaveBeenCalled();finish();await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/clinical-notes/drafts/293/appointment',{clinicalSessionId:166,confirmed:true});
 expect(w.emitted('linked')[0][0]).toMatchObject({clinical_session_id:166});w.unmount();
});
it('leaves the draft open and unmodified if the source could not save',async()=>{
 const w=mount(Component,{props:{draftId:293,beforeLink:()=>Promise.reject(new Error('Source save is pending'))}});await flushPromises();
 await w.find('select').setValue('166');await w.find('input').setValue(true);await w.findAll('button').find(b=>b.text()==='Link appointment').trigger('click');await flushPromises();
 expect(api.post).not.toHaveBeenCalled();expect(w.text()).toContain('Source save is pending');w.unmount();
});
