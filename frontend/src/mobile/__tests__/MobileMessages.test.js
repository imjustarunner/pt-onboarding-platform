import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createRouter,createWebHistory} from 'vue-router';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn(),delete:vi.fn()}));vi.mock('axios',()=>({default:api}));
import MobileMessages from '../MobileMessages.vue';
let wrapper,router;
const direct={key:'chat:10',id:10,kind:'chat',category:'direct',title:'Jordan Example',sender:'Jordan Example',preview:'Latest message',at:'2026-11-06T13:00:00Z',unread:true,unreadCount:2};
const secure={key:'chat:11',id:11,kind:'chat',category:'secure',title:'Mi••• Ex•••',sender:'Mi••• Ex•••',preview:'Secure message · tap to unlock',at:'2026-11-06T12:00:00Z',secure:true,unread:true};
const file={key:'files:4',kind:'files',id:4,threadId:10,category:'direct',title:'pilot-photo.png',original_filename:'pilot-photo.png',mime_type:'image/png',byte_size:2048,preview:'Photo notes',sender:'Jordan Example'};
const root={id:100,thread_id:10,sender_user_id:2,sender_first_name:'Jordan',sender_last_name:'Example',body:'ORIGINAL MESSAGE',created_at:'2026-11-06T12:00:00Z',reply_count:1,latest_reply:{id:101,body:'LATEST REPLY',sender_first_name:'Taylor',sender_last_name:'Example'}};
const response=()=>({items:[direct,secure],counts:{all:{total:2,unread:2,needs:1},direct:{total:1,unread:1,needs:1},secure:{total:1,unread:1,needs:0},groups:{total:0,unread:0,needs:0}},nextCursor:null});
async function start(path='/mobile/workspace?view=home&suite=direct',props={}){
  router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span/>'}}]});await router.push(path);
  wrapper=mount(MobileMessages,{attachTo:document.body,props:{apiBase:'/api/quick-view',sessionToken:'scoped',userId:1,visible:true,preferences:{swipeLeft:'archive',swipeRight:'read'},...props},global:{plugins:[router]}});await flushPromises();return wrapper;
}
beforeEach(()=>{
  vi.resetAllMocks();history.replaceState({},'','/mobile/workspace');
  vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}});
  Object.defineProperty(HTMLElement.prototype,'scrollHeight',{configurable:true,get(){return this.classList.contains('mm-timeline')?1200:0;}});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){return {top:this.dataset?.messageId==='100'?-200:0,bottom:400,left:0,right:390,width:390,height:400};});
  URL.createObjectURL=vi.fn(()=> 'blob:fixture');URL.revokeObjectURL=vi.fn();
  api.get.mockImplementation(async(url,{params}={})=>({data:url.endsWith('/messages/inbox')?{...response(),items:params?.suite==='files'?[file]:response().items}:url.includes('/messages/chat/')?{id:10,title:'Jordan Example',thread_type:'direct',participants:[{id:1,first_name:'Taylor',last_name:'Example',profile_photo_path:'photos/me.png'},{id:2,first_name:'Jordan',last_name:'Example'}]}:url.includes('/messages/files/')?new Blob(['fixture']):{messages:params?.parentMessageId?[root,{id:101,sender_user_id:1,sender_first_name:'Taylor',body:'LATEST REPLY',created_at:'2026-11-06T12:30:00Z'}]:[root,{id:102,sender_user_id:1,sender_first_name:'Taylor',body:'NEWEST MESSAGE',created_at:'2026-11-06T13:00:00Z'}],firstUnreadId:100,hasOlder:false}}));
  api.patch.mockResolvedValue({data:{ok:true}});api.post.mockResolvedValue({data:{ok:true}});
});
afterEach(async()=>{wrapper?.unmount();router?.options.history.destroy();await new Promise(resolve=>setTimeout(resolve,25));document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals();});
const row=name=>wrapper.findAll('.mm-row').find(button=>button.text().includes(name));
function pointer(button,type,x,y){const event=new MouseEvent(type,{bubbles:true,clientX:x,clientY:y});Object.defineProperty(event,'pointerType',{value:'touch'});button.element.dispatchEvent(event);}
async function back(){router.back();await new Promise(resolve=>setTimeout(resolve,30));await flushPromises();}
it('opens at the latest message, shows unread above, photos and the attached latest reply',async()=>{
 await start();await row('Jordan').trigger('click');await flushPromises();
 expect(wrapper.get('.mm-timeline').element.scrollTop).toBe(1200);expect(wrapper.get('.mm-unread-jump').text()).toContain('Unread');
 expect(wrapper.get('.mm-reply-preview').text()).toContain('LATEST REPLY');expect(wrapper.get('.has-replies').text()).toBe('1 reply');
 expect(wrapper.find('.mm-person-avatar img').attributes('src')).toBe('/api/uploads/photos/me.png');expect(wrapper.text()).not.toContain('Thread 10');
});
it('keeps the original message and Back returns to the selected direct conversation then its category',async()=>{
 await start();await row('Jordan').trigger('click');await flushPromises();await wrapper.get('.mm-thread-link').trigger('click');await flushPromises();
 expect(wrapper.get('[aria-label="Original message"]').text()).toContain('ORIGINAL MESSAGE');expect(wrapper.get('.mm-timeline').text()).toContain('LATEST REPLY');
 await back();expect(router.currentRoute.value.query.threadId).toBe('10');expect(router.currentRoute.value.query.parentId).toBeUndefined();expect(wrapper.text()).toContain('NEWEST MESSAGE');
 await wrapper.get('.mm-back').trigger('click');await new Promise(resolve=>setTimeout(resolve,30));await flushPromises();expect(router.currentRoute.value.query.suite).toBe('direct');expect(row('Jordan')).toBeTruthy();
});
it('archives with a left swipe, marks read with a right swipe, and includes archived only by choice',async()=>{
 await start();expect(api.get.mock.calls[0][1].params.includeArchived).toBe('0');
 const card=row('Jordan');pointer(card,'pointerdown',200,100);pointer(card,'pointermove',80,104);pointer(card,'pointerup',80,104);await flushPromises();
 expect(api.patch).toHaveBeenCalledWith('/api/quick-view/messages/chat/10/archive',{archived:true},expect.any(Object));
 pointer(card,'pointerdown',80,100);pointer(card,'pointermove',200,103);pointer(card,'pointerup',200,103);await flushPromises();
 expect(api.patch).toHaveBeenCalledWith('/api/quick-view/messages/chat/10/state',{read:true},expect.any(Object));
 await wrapper.get('[aria-label="Include archived conversations"]').trigger('click');await flushPromises();expect(api.get.mock.calls.at(-1)[1].params.includeArchived).toBe('1');
});
it('conceals secure message bodies and names until explicitly revealed, and lock removes content',async()=>{
 await start();await row('Mi•••').trigger('click');await flushPromises();
 expect(wrapper.text()).not.toContain('ORIGINAL MESSAGE');expect(wrapper.text()).not.toContain('Jordan Example');
 await wrapper.findAll('.mm-secure-toggle')[0].trigger('click');expect(wrapper.text()).toContain('ORIGINAL MESSAGE');
 await wrapper.findAll('.mm-secure-notice button')[0].trigger('click');expect(wrapper.text()).toContain('Jordan Example');
 await wrapper.get('[aria-label="Lock secure conversation"]').trigger('click');expect(wrapper.text()).not.toContain('ORIGINAL MESSAGE');expect(wrapper.text()).not.toContain('Jordan Example');expect(wrapper.text()).toContain('Unlock conversation');
});
it('shows file details and can view the file without first navigating to its message',async()=>{
 await start('/mobile/workspace?view=home&suite=files');expect(wrapper.text()).toContain('pilot-photo.png');expect(wrapper.text()).toContain('2 KB');
 await wrapper.findAll('.mm-row-tools button').find(button=>button.text()==='View').trigger('click');await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/api/quick-view/messages/files/4',expect.objectContaining({responseType:'blob'}));expect(document.querySelector('[aria-label="File preview"] img')).not.toBeNull();expect(router.currentRoute.value.query.threadId).toBeUndefined();
});
it('shows category and filter counts, including groups',async()=>{
 await start();expect(wrapper.findAll('.mm-categories button').find(button=>button.text().includes('Groups')).text()).toContain('0');
 expect(wrapper.findAll('.mm-filters button').map(button=>button.text())).toEqual(['All 1','Unread 1','Needs reply 1']);
});

it('keeps recipient and group names on cards when the latest author is someone else',async()=>{
 api.get.mockResolvedValue({data:{items:[{...direct,sender:'You'},{key:'chat:20',id:20,kind:'chat',category:'groups',title:'Pilot team',sender:'Avery Example',preview:'Latest group update'}],counts:response().counts}});
 await start();expect(row('Jordan').get('.mm-row-top strong').text()).toBe('Jordan Example');expect(row('Jordan').get('.mm-preview').text()).toContain('You:');expect(row('Pilot team').get('.mm-row-top strong').text()).toBe('Pilot team');expect(row('Pilot team').get('.mm-preview').text()).toContain('Avery Example:');
});
it('shows meaningful empty-text fallback and always conceals secure previews in the list',async()=>{
 api.get.mockResolvedValue({data:{items:[{...direct,preview:''},{...secure,preview:'PRIVATE SECURE BODY'}],counts:response().counts}});
 await start();expect(row('Jordan').get('.mm-preview').text()).toContain('Message · open to read');expect(row('Mi•••').get('.mm-preview').text()).toBe('Secure message · tap to unlock');expect(wrapper.text()).not.toContain('PRIVATE SECURE BODY');
});

it('clears cached secure content when a refresh reports revoked conversation access',async()=>{
 await start();await row('Mi•••').trigger('click');await flushPromises();await wrapper.findAll('.mm-secure-toggle')[0].trigger('click');expect(wrapper.text()).toContain('ORIGINAL MESSAGE');
 api.get.mockRejectedValue({response:{status:403,data:{error:{message:'Conversation access changed'}}}});
 await wrapper.findAll('.mm-reaction')[0].trigger('click');await flushPromises();expect(wrapper.text()).not.toContain('ORIGINAL MESSAGE');expect(wrapper.text()).toContain('Conversation access changed');expect(wrapper.text()).toContain('Unlock conversation');
});

it('does not report an empty inbox or zero counts when loading failed, and retry recovers',async()=>{
 api.get.mockRejectedValueOnce({response:{status:500,data:{error:{message:"Illegal mix of collations for operation IN"}}}});
 await start();expect(wrapper.get('[role="alert"]').text()).toContain('Messages could not be loaded');
 expect(wrapper.text()).not.toContain('Illegal mix');expect(wrapper.text()).not.toContain('No conversations in this view.');expect(wrapper.text()).not.toContain('You’re caught up.');
 expect(wrapper.findAll('.mm-filters span').map(n=>n.text())).toEqual(['—','—','—']);
 await wrapper.get('[role="alert"] button').trigger('click');await flushPromises();
 expect(wrapper.find('[role="alert"]').exists()).toBe(false);expect(row('Jordan')).toBeTruthy();expect(wrapper.findAll('.mm-filters span').map(n=>n.text())).toEqual(['1','1','1']);
});
it('labels failed refresh as stale data and does not carry that data into a failed different category',async()=>{
 await start();api.get.mockRejectedValue({response:{status:500,data:{error:{message:'database internal detail'}}}});
 await wrapper.get('[aria-label="Refresh messages"]').trigger('click');await flushPromises();
 expect(wrapper.get('[role="alert"]').text()).toContain('Previously loaded conversations');expect(row('Jordan')).toBeTruthy();
 await wrapper.findAll('.mm-categories button').find(b=>b.text().includes('Email')).trigger('click');await flushPromises();
 expect(wrapper.find('.mm-row').exists()).toBe(false);expect(wrapper.text()).not.toContain('No conversations in this view.');expect(wrapper.findAll('.mm-filters span').map(n=>n.text())).toEqual(['—','—','—']);
});

it('clears previously loaded inbox content when current access is revoked',async()=>{
 await start();api.get.mockRejectedValue({response:{status:403,data:{error:{message:'Conversation access changed'}}}});
 await wrapper.get('[aria-label="Refresh messages"]').trigger('click');await flushPromises();
 expect(wrapper.text()).toContain('Conversation access changed');expect(wrapper.find('.mm-row').exists()).toBe(false);expect(wrapper.findAll('.mm-filters span').map(n=>n.text())).toEqual(['—','—','—']);
});
