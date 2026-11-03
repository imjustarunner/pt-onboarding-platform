import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,it,expect,vi} from 'vitest';
import {reactive} from 'vue';
import View from '../SupportReplyFeedbackView.vue';
import api from '../../../services/api';
const state=vi.hoisted(()=>({route:null}));
vi.mock('vue-router',()=>({useRoute:()=>state.route,onBeforeRouteLeave:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn(),post:vi.fn()}}));
const payload=()=>({batch:{id:1,title:'Three-week review',total:1,reviewed:0},window:{start:'2026-10-12T06:00:00Z',end:'2026-11-02T19:00:00Z'},totals:{tickets:1,sent:1,drafts:0},coverage:{},rows:[{entryId:7,ticketId:51,subject:'Schedule request',owner:{name:'Owner'},originalReceived:{body:'Incoming text',fromEmail:'school@example.test'},deliveries:[{body:'Actual reply',actorName:'Alex Rivera',fromEmail:'support@example.test'}],draftSnapshots:[],comparison:{generatedDraft:null},canRateActual:true,canRateDraft:false,feedback:{revision:0}}]});
beforeEach(()=>{vi.clearAllMocks();state.route=reactive({query:{agencyId:'2',batch:'1'}});api.get.mockResolvedValue({data:payload()});});
it('shows sender and actual responder, with missing historical drafts clearly unavailable',async()=>{
 const w=mount(View);await flushPromises();expect(w.text()).toContain('school@example.test');expect(w.text()).toContain('Alex Rivera');expect(w.text()).toContain('Actual reply');expect(w.text()).toContain('No readable original draft');expect(w.findAll('fieldset')[1].attributes('disabled')).toBeDefined();expect(api.put).not.toHaveBeenCalled();w.unmount();
});
it('saves independent ratings and wording, then reloads persisted feedback',async()=>{
 const w=mount(View);await flushPromises();await w.find('input[value="acceptable"]').setValue(true);await w.find('#preferred-7').setValue('Please include the next step.');await w.find('#notes-7').setValue('Warm, specific, and concise.');
 const feedback={actualRating:'acceptable',draftRating:null,preferredReply:'Please include the next step.',notes:'Warm, specific, and concise.',revision:1,reviewedAt:'2026-11-02T19:00:00Z'};
 api.put.mockResolvedValue({data:{feedback}});
 await w.find('form').trigger('submit');await flushPromises();expect(api.put).toHaveBeenCalledWith('/support-email-review/batches/1/entries/7',expect.objectContaining({agencyId:2,actualRating:'acceptable',draftRating:null,revision:0,preferredReply:'Please include the next step.'}),expect.any(Object));expect(w.text()).toContain('1 / 1 with feedback');expect(w.text()).toContain('Saved in the app.');
 const saved=payload();saved.rows[0].feedback=feedback;api.get.mockResolvedValue({data:saved});w.unmount();const reloaded=mount(View);await flushPromises();expect(reloaded.find('#preferred-7').element.value).toBe('Please include the next step.');expect(reloaded.find('input[value="acceptable"]').element.checked).toBe(true);reloaded.unmount();
});
it('preserves unsaved text on failure and blocks premature completion',async()=>{
 const w=mount(View);await flushPromises();expect(w.find('.overview button').attributes('disabled')).toBeDefined();await w.find('#notes-7').setValue('Keep this after a save error.');api.put.mockRejectedValue({response:{data:{error:{message:'Refresh before saving again.'}}}});await w.find('form').trigger('submit');await flushPromises();expect(w.find('#notes-7').element.value).toBe('Keep this after a save error.');expect(w.text()).toContain('Refresh before saving again.');expect(w.text()).toContain('Unsaved changes');expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('marks complete after a successful completion receipt',async()=>{
 const p=payload();p.rows[0].feedback={revision:1,actualRating:'good',reviewedAt:'2026-11-02T19:00:00Z'};api.get.mockResolvedValue({data:p});api.post.mockResolvedValue({data:{completed:true}});const w=mount(View);await flushPromises();await w.find('.overview button').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/support-email-review/batches/1/complete',{agencyId:2});expect(w.text()).toContain('Review complete');expect(w.find('textarea').attributes('disabled')).toBeDefined();w.unmount();
});

it('allows finishing after written corrections even when ratings are left blank',async()=>{
 const p=payload();p.rows[0].feedback={revision:1,notes:'Use a warmer acknowledgement.',actualRating:null,draftRating:null};api.get.mockResolvedValue({data:p});api.post.mockResolvedValue({data:{completed:true}});const w=mount(View);await flushPromises();expect(w.find('.overview button').attributes('disabled')).toBeUndefined();await w.find('.overview button').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/support-email-review/batches/1/complete',{agencyId:2});expect(w.text()).toContain('Review complete');w.unmount();
});
