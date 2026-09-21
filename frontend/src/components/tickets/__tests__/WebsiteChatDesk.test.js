import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Desk from '../WebsiteChatDesk.vue';
import api from '../../../services/api';
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:7}})}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
let wrapper,rows,threads;
const detail=id=>({messages:threads[id],quickReplies:[{label:'Get started',body:'Welcome. https://www.itsco.health/join/itsco/counseling'}],pageLinks:[{label:'Services',url:'https://www.itsco.health/services'}],viewers:[{userId:1,name:'Staff One',memberNumber:1,viewing:true,typing:true}],topics:[{id:'billing',label:'Billing'}],canReply:true});
beforeEach(()=>{vi.useFakeTimers();localStorage.clear();sessionStorage.clear();rows=[{id:'visitor-a',name:'ITSCO',color:'#165c4f',lastMessageId:1,lastVisitorMessageId:1,pagePath:'/services',visitorMessages:1},{id:'visitor-b',name:'NLU',color:'#234567',lastMessageId:2,lastVisitorMessageId:2,pagePath:'/tutoring',visitorMessages:1}];threads={'visitor-a':[{id:1,sender:'visitor',body:'Question'}],'visitor-b':[{id:2,sender:'visitor',body:'Another question'}]};api.post.mockImplementation(async url=>({data:url.endsWith('/referral')?{url:'https://www.itsco.health/live-chat-support?ref=test'}:detail(url.includes('visitor-b')?'visitor-b':'visitor-a')}));api.get.mockImplementation(async url=>({data:url==='/website-chat/sessions'?{sessions:rows}:url==='/website-chat/team'?{team:[{userId:1,name:'Staff One'}]}:detail(url.split('/').at(-1))}));});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();vi.clearAllMocks();});
async function render(){wrapper=mount(Desk,{global:{stubs:{teleport:true}}});await flushPromises();}
async function pointer(handle,type,options){const event=new MouseEvent(type,{bubbles:true,cancelable:true,...options});event._vts=Date.now()+1;Object.defineProperty(event,'pointerId',{value:options.pointerId});handle.element.dispatchEvent(event);await flushPromises();}
async function select(index=0){await wrapper.findAll('.visitor-toast button')[index].trigger('click');await flushPromises();}
it('shows page, initiation reminder, viewer names, quick replies and manual sends',async()=>{await render();expect(wrapper.text()).toContain('They cannot chat with you');expect(wrapper.text()).toContain('/services');await select();expect(wrapper.text()).toContain('Staff One (Support team member 1) · typing');await wrapper.find('[aria-label="Quick replies"]').setValue('Welcome. https://www.itsco.health/join/itsco/counseling');expect(api.post.mock.calls.filter(([url])=>url.endsWith('/messages'))).toHaveLength(0);await wrapper.find('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/website-chat/sessions/visitor-a/messages',expect.objectContaining({body:expect.stringContaining('/join/itsco')}),expect.anything());});
it('closing returns the conversation to available chats without deleting it',async()=>{await render();await select();await wrapper.findAll('button').find(b=>b.text()==='Close chat').trigger('click');await flushPromises();expect(wrapper.findAll('.visitor-toast')).toHaveLength(2);expect(wrapper.find('textarea').exists()).toBe(false);expect(api.post).toHaveBeenCalledWith('/website-chat/sessions/visitor-a/close',{},expect.anything());await select();expect(wrapper.find('textarea').exists()).toBe(true);});
it('preserves separate drafts and alerts on another open chat',async()=>{await render();await select();await wrapper.find('textarea').setValue('Draft A');await select(1);await wrapper.find('textarea').setValue('Draft B');threads['visitor-a'].push({id:3,sender:'visitor',body:'Hello again'});rows[0].lastVisitorMessageId=3;await vi.advanceTimersByTimeAsync(8000);expect(wrapper.find('.visitor-toast').text()).toContain('Message waiting');await select();expect(wrapper.find('textarea').element.value).toBe('Draft A');});
it('requires confirmation to flag standards and can insert a ticket invitation',async()=>{await render();threads['visitor-a'].push({id:3,sender:'staff',body:'Welcome'});await select();await wrapper.findAll('button').find(b=>b.text()==='Flag Community Standards').trigger('click');expect(api.post.mock.calls.some(([url])=>url.endsWith('/standards'))).toBe(false);await wrapper.findAll('button').find(b=>b.text()==='Confirm flag & notify visitor').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/website-chat/sessions/visitor-a/standards',{confirmed:true},expect.anything());await wrapper.findAll('button').find(b=>b.text()==='Insert support ticket invitation').trigger('click');await flushPromises();expect(wrapper.find('textarea').element.value).toContain('/live-chat-support?ref=test');});
it('provides a team availability page',async()=>{await render();await wrapper.findAll('button').find(b=>b.text()==='Team availability').trigger('click');await flushPromises();expect(wrapper.text()).toContain('Staff One');});

it('clicking the selected visitor collapses and reopens the chat with its draft intact',async()=>{await render();await select();await wrapper.find('textarea').setValue('Unsent reply');await select();expect(wrapper.find('textarea').exists()).toBe(false);expect(wrapper.find('.visitor-toast button').attributes('aria-expanded')).toBe('false');expect(api.post.mock.calls.some(([url])=>url.endsWith('/close'))).toBe(false);threads['visitor-a'].push({id:3,sender:'visitor',body:'Still here'});rows[0].lastVisitorMessageId=3;await vi.advanceTimersByTimeAsync(8000);expect(wrapper.find('textarea').exists()).toBe(false);expect(wrapper.find('.visitor-toast').text()).toContain('Message waiting');await select();expect(wrapper.find('textarea').element.value).toBe('Unsent reply');expect(wrapper.find('.visitor-toast button').attributes('aria-expanded')).toBe('true');});
it('keeps the desk minimized across refreshes, new visitors, new messages and remounts',async()=>{
 await render();await wrapper.find('[aria-label="Minimize Live Chat"]').trigger('click');
 rows.push({id:'visitor-c',name:'New visitor',lastVisitorMessageId:8});
 await vi.advanceTimersByTimeAsync(24000);expect(wrapper.find('.webchat-desk-panel').exists()).toBe(false);expect(wrapper.find('.webchat-desk-toggle').text()).toContain('message');
 wrapper.unmount();await render();expect(wrapper.find('.webchat-desk-panel').exists()).toBe(false);
});
it('does not label answered visitor messages as waiting, including another staff member’s reply',async()=>{
 rows[0].lastStaffMessageId=3;rows[0].lastMessageId=4; // A system event may be the newest message.
 rows[1].lastStaffMessageId=5;await render();expect(wrapper.findAll('.visitor-toast b')).toHaveLength(0);expect(wrapper.find('.webchat-desk-toggle').text()).not.toContain('waiting');
 rows[0].lastVisitorMessageId=6;await vi.advanceTimersByTimeAsync(8000);expect(wrapper.find('.visitor-toast').find('b').text()).toBe('Message waiting');
 rows[0].lastStaffMessageId=7;await vi.advanceTimersByTimeAsync(8000);expect(wrapper.findAll('.visitor-toast b')).toHaveLength(0);
});
it('keeps closed chats closed and read across polling and remounts',async()=>{
 await render();await select();await wrapper.findAll('button').find(b=>b.text()==='Close chat').trigger('click');await flushPromises();
 await vi.advanceTimersByTimeAsync(24000);expect(wrapper.find('textarea').exists()).toBe(false);expect(wrapper.find('.visitor-toast').find('b').exists()).toBe(false);
 wrapper.unmount();await render();expect(wrapper.find('textarea').exists()).toBe(false);expect(wrapper.find('.visitor-toast').find('b').exists()).toBe(false);
 rows[0].lastVisitorMessageId=7;await vi.advanceTimersByTimeAsync(8000);expect(wrapper.find('.visitor-toast').find('b').text()).toBe('Message waiting');expect(wrapper.find('textarea').exists()).toBe(false);
});
it('remembers a sent reply even if a stale queue response arrives afterward',async()=>{
 await render();await select();await wrapper.find('textarea').setValue('We can help.');
 api.post.mockImplementation(async url=>({data:url.endsWith('/messages')?{...detail('visitor-a'),messages:[...threads['visitor-a'],{id:4,sender:'visitor',body:'One more question'},{id:5,sender:'staff',body:'We can help.'}]}:detail('visitor-a')}));
 await wrapper.find('form').trigger('submit');await flushPromises();rows[0].lastVisitorMessageId=4;
 await wrapper.findAll('button').find(b=>b.text()==='Close chat').trigger('click');await flushPromises();await vi.advanceTimersByTimeAsync(8000);
 expect(wrapper.find('.visitor-toast').find('b').exists()).toBe(false);
});
it('allows dragging the desk, remembers its position, and keeps it within the viewport',async()=>{
 await render();const aside=wrapper.find('.webchat-desk');aside.element.getBoundingClientRect=()=>({left:100,top:100,width:300,height:200});
 const handle=wrapper.find('[aria-label="Move Live Chat"]');
 await pointer(handle,'pointerdown',{button:0,pointerId:1,clientX:110,clientY:110});await pointer(handle,'pointermove',{pointerId:1,clientX:210,clientY:160});await pointer(handle,'pointerup',{pointerId:1});
 expect(wrapper.find('.webchat-desk').element.style.left).toBe('200px');expect(wrapper.find('.webchat-desk').element.style.top).toBe('150px');
 wrapper.unmount();await render();expect(wrapper.find('.webchat-desk').element.style.left).toBe('200px');
 const panel=wrapper.find('.webchat-desk');panel.element.getBoundingClientRect=()=>({left:200,top:150,width:300,height:200});
 await pointer(wrapper.find('[aria-label="Move Live Chat"]'),'pointerdown',{button:0,pointerId:2,clientX:200,clientY:150});await pointer(wrapper.find('[aria-label="Move Live Chat"]'),'pointermove',{pointerId:2,clientX:10000,clientY:10000});
 expect(Number.parseInt(wrapper.find('.webchat-desk').element.style.left)).toBe(window.innerWidth-308);expect(Number.parseInt(wrapper.find('.webchat-desk').element.style.top)).toBe(window.innerHeight-208);
});
it('supports moving the desk with arrow keys',async()=>{
 await render();wrapper.find('.webchat-desk').element.getBoundingClientRect=()=>({left:100,top:100,width:300,height:200});
 await wrapper.find('[aria-label="Move Live Chat"]').trigger('keydown',{key:'ArrowRight'});expect(wrapper.find('.webchat-desk').element.style.left).toBe('120px');
});
