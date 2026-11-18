import {beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn()}));vi.mock('../../../services/api',()=>({default:api}));
import Meeting from '../TransitionMeeting.vue';
const props={practice:{id:2,name:'ITSCO'},people:[{id:1,name:'Example trainer'},{id:2,name:'Example employee'}],invitees:[{id:2,name:'Example employee'}],actorId:1,label:'Group 1',linkMeeting:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async url=>({data:url.endsWith('/participants')?{participants:[{id:1}]}:{events:[{id:7,title:'Example meeting',start_at:'2026-11-19T18:00:00Z'}]}}));api.post.mockResolvedValue({data:{events:[{id:7}],delivery:{failed:0},emailInvitationQueued:true}});api.put.mockResolvedValue({data:{}});props.linkMeeting.mockResolvedValue({});});
it('creates only the selected invitations plus the coordinator, and never sends on opening',async()=>{
 const w=mount(Meeting,{props});await flushPromises();expect(api.post).not.toHaveBeenCalled();await w.get('input[type=date]').setValue('2026-11-19');await w.get('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/team-meetings/training',expect.objectContaining({agencyId:2,participants:[{userId:2,required:true},{userId:1,required:false}],agencyVisible:false}));expect(props.linkMeeting).toHaveBeenCalledWith(7);expect(w.text()).toContain('email queue');w.unmount();
});
it('keeps a created meeting after a link failure and retries linking without creating another meeting',async()=>{
 props.linkMeeting.mockRejectedValueOnce(Error('Board changed'));
 const w=mount(Meeting,{props});await flushPromises();await w.get('input[type=date]').setValue('2026-11-19');await w.get('form').trigger('submit');await flushPromises();expect(w.text()).toContain('do not create it again');
 await w.findAll('button').find(b=>b.text()==='Link this saved meeting to the checklist').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledTimes(1);expect(props.linkMeeting).toHaveBeenCalledTimes(2);w.unmount();
});
it('adds to the selected existing meeting and keeps prior attendees untouched',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/participants')?{participants:[{id:2}]}:{events:[{id:7,title:'Example meeting',start_at:'2026-11-19T18:00:00Z'}]}}));
 const w=mount(Meeting,{props});await flushPromises();await w.findAll('button').find(b=>b.text()==='Add to a meeting').trigger('click');await w.findAll('select').at(-1).setValue(7);await w.get('form').trigger('submit');await flushPromises();expect(api.post).not.toHaveBeenCalled();expect(w.text()).toContain('Already invited');expect(props.linkMeeting).toHaveBeenCalledWith(7);w.unmount();
});
it('holds a new create retry after uncertain delivery and offers existing-meeting review',async()=>{
 api.post.mockRejectedValueOnce({code:'ECONNABORTED'});
 const w=mount(Meeting,{props});await flushPromises();await w.get('input[type=date]').setValue('2026-11-19');await w.get('form').trigger('submit');await flushPromises();
 expect(w.text()).toContain('may have completed');expect(w.findAll('button').find(b=>b.text()==='Create meeting & email invitations').element.disabled).toBe(true);
 await w.findAll('button').find(b=>b.text()==='Add to a meeting').trigger('click');expect(w.findAll('button').find(b=>b.text()==='Add people & email invitations').element.disabled).toBe(false);w.unmount();
});
