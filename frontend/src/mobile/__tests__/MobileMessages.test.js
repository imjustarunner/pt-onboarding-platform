import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createRouter,createWebHistory} from 'vue-router';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn(),delete:vi.fn()}));vi.mock('axios',()=>({default:api}));
vi.mock('../../services/api',()=>({default:api}));
import MobileMessages from '../MobileMessages.vue';
let wrapper,router;
const direct={key:'chat:10',id:10,kind:'chat',category:'direct',title:'Jordan Example',sender:'Jordan Example',preview:'Latest message',at:'2026-11-06T13:00:00Z',unread:true,unreadCount:2};
const secure={key:'chat:11',id:11,kind:'chat',category:'secure',title:'Mi••• Ex•••',sender:'Mi••• Ex•••',preview:'Secure message · tap to unlock',at:'2026-11-06T12:00:00Z',secure:true,unread:true};
const file={key:'files:4',kind:'files',id:4,threadId:10,category:'direct',title:'pilot-photo.png',original_filename:'pilot-photo.png',mime_type:'image/png',byte_size:2048,preview:'Photo notes',sender:'Jordan Example'};
const root={id:100,thread_id:10,sender_user_id:2,sender_first_name:'Jordan',sender_last_name:'Example',body:'ORIGINAL MESSAGE',created_at:'2026-11-06T12:00:00Z',reply_count:1,latest_reply:{id:101,body:'LATEST REPLY',sender_first_name:'Taylor',sender_last_name:'Example'}};
const response=()=>({items:[{...direct},{...secure}],counts:{all:{total:2,unread:2,needs:1},direct:{total:1,unread:1,needs:1},secure:{total:1,unread:1,needs:0},groups:{total:0,unread:0,needs:0}},nextCursor:null});
async function start(path='/mobile/workspace?view=home&suite=direct',props={}){
  router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span/>'}}]});await router.push(path);
  wrapper=mount(MobileMessages,{attachTo:document.body,props:{apiBase:'/api/quick-view',sessionToken:'scoped',userId:1,visible:true,preferences:{swipeLeft:'archive',swipeRight:'read'},...props},global:{plugins:[router]}});await flushPromises();return wrapper;
}
beforeEach(()=>{
  vi.resetAllMocks();localStorage.clear();history.replaceState({},'','/mobile/workspace');
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
 expect(wrapper.find('.mobile-identity-avatar .identity-picture img').attributes('src')).toBe('/api/uploads/photos/me.png');expect(wrapper.text()).not.toContain('Thread 10');
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
 expect(wrapper.findAll('.mm-filters button').map(button=>button.text())).toEqual(['All','Unread 1','Sent 0','Drafts —']);
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
 expect(wrapper.find('[role="alert"]').exists()).toBe(false);expect(row('Jordan')).toBeTruthy();expect(wrapper.findAll('.mm-filters span').map(n=>n.text())).toEqual(['1','0','—']);
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

it('opens a direct recipient picker and never emits email from the Direct plus button',async()=>{
 const original=api.get.getMockImplementation();api.get.mockImplementation(async(url,config)=>url.endsWith('/directory')?{data:{providers:[{id:1,displayName:'Me'},{id:2,displayName:'Jordan Example',email:'jordan@example.invalid',profilePhotoUrl:'/uploads/photos/jordan.png'}],schoolStaff:[{id:2,displayName:'Jordan Example'},{id:3,displayName:'School Staff'}]}}:original(url,config));
 api.post.mockResolvedValue({data:{threadId:10}});await start();await wrapper.get('[aria-label="New direct message"]').trigger('click');await flushPromises();
 const sheet=document.querySelector('[role="dialog"][aria-label="New direct message"]');expect(sheet).not.toBeNull();expect(sheet.querySelectorAll('.mm-recipient')).toHaveLength(2);expect(wrapper.emitted('compose-email')).toBeUndefined();
 sheet.querySelector('.mm-recipient').click();await flushPromises();expect(api.post).toHaveBeenCalledWith('/api/quick-view/chat/direct',{otherUserId:2},expect.objectContaining({headers:{'X-Quick-View-Session':'scoped'}}));expect(router.currentRoute.value.query).toMatchObject({suite:'direct',threadId:'10'});expect(document.querySelector('.mm-recipient-overlay')).toBeNull();
});
it('keeps email composition in Email and provides explicit choices in All',async()=>{
 await start('/mobile/workspace?view=home&suite=email');await wrapper.get('[aria-label="New email"]').trigger('click');expect(wrapper.emitted('compose-email')).toHaveLength(1);
 await wrapper.findAll('.mm-categories button').find(button=>button.text().startsWith('All')).trigger('click');await flushPromises();await wrapper.get('[aria-label="New message"]').trigger('click');expect(wrapper.get('[aria-label="New message options"]').text()).toContain('New direct message');expect(wrapper.get('[aria-label="New message options"]').text()).toContain('New email');
});
it('defaults All to unread while preserving an explicit All filter choice',async()=>{
 await start('/mobile/workspace?view=home');expect(api.get.mock.calls[0][1].params).toMatchObject({suite:'all',filter:'unread'});expect(wrapper.findAll('.mm-filters button')[1].attributes('aria-pressed')).toBe('true');await wrapper.findAll('.mm-filters button')[0].trigger('click');await flushPromises();expect(api.get.mock.calls.at(-1)[1].params.filter).toBe('all');
});
it('shows the Archive label at the exposed right edge with its own color class',async()=>{
 await start();const card=row('Jordan');pointer(card,'pointerdown',200,100);pointer(card,'pointermove',90,101);await flushPromises();const swipe=card.element.closest('.mm-swipe');expect(swipe.classList.contains('swipe-left')).toBe(true);expect(swipe.classList.contains('action-archive')).toBe(true);expect(swipe.querySelector('.mm-swipe-label').textContent).toBe('Archive');pointer(card,'pointercancel',90,101);await flushPromises();pointer(card,'pointerdown',80,100);pointer(card,'pointermove',190,101);await flushPromises();expect(swipe.classList.contains('swipe-left')).toBe(false);expect(swipe.classList.contains('action-read')).toBe(true);expect(swipe.querySelector('.mm-swipe-label').textContent).toBe('Read');
});
it('uses ordinary unread browsing without a guessed reply obligation and exposes Unknown unread counts',async()=>{
 await start();await wrapper.findAll('.mm-filters button')[2].trigger('click');await flushPromises();expect(wrapper.text()).not.toContain('Needs reply');expect(wrapper.find('.mm-filter-help').exists()).toBe(false);expect(wrapper.findAll('.mm-categories button').some(button=>button.text().includes('Unknown senders'))).toBe(true);
});

it('retains the selected agency when opening a teammate from another authorized workplace',async()=>{
 const original=api.get.getMockImplementation();api.get.mockImplementation(async(url,config)=>url.endsWith('/directory')?{data:{providers:[{id:2,agencyId:20,agencyName:'Other authorized agency',displayName:'Jordan Other'}]}}:original(url,config));
 api.post.mockResolvedValue({data:{threadId:42}});await start();await wrapper.get('[aria-label="New direct message"]').trigger('click');await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/api/quick-view/directory',expect.objectContaining({params:{agencyId:'all'}}));expect(document.body.textContent).toContain('Other authorized agency');document.querySelector('.mm-recipient').click();await flushPromises();expect(api.post).toHaveBeenCalledWith('/api/quick-view/chat/direct',{otherUserId:2,agencyId:20},expect.any(Object));
});
it('Secure plus opens only eligible client recipients and only a secure conversation',async()=>{
 const original=api.get.getMockImplementation();api.get.mockImplementation(async(url,config)=>url.includes('/messages/clients?')?{data:{contacts:[{id:'20:70:self',clientId:70,agencyId:20,agencyName:'Other agency',displayName:'Syn* Cli*',age:12,recipientKey:'guardian:90',contactName:'Syn* Gua*'}]}}:original(url,config));api.post.mockResolvedValue({data:{threadId:50}});
 await start('/mobile/workspace?view=home&suite=secure');await wrapper.get('[aria-label="New secure message"]').trigger('click');await flushPromises();const sheet=document.querySelector('.mm-recipient-sheet');expect(sheet.textContent).toContain('Find one of my clients');expect(sheet.textContent).not.toContain('New email');sheet.querySelector('.mm-recipient').click();await flushPromises();expect(api.post).toHaveBeenCalledWith('/api/quick-view/messages/clients/70/contact',{agencyId:20,recipientKey:'guardian:90',channel:'secure'},expect.any(Object));expect(router.currentRoute.value.query).toMatchObject({suite:'secure',secure:'1',threadId:'50'});expect(wrapper.emitted('compose-email')).toBeUndefined();
});
it('opens the channel browser from Channels plus and filters authorized channels by name',async()=>{
 const original=api.get.getMockImplementation();api.get.mockImplementation(async(url,config)=>url.endsWith('/messages/channels')?{data:{channels:[{id:40,name:'Denver',agencyName:'Office'},{id:41,name:'Boulder',agencyName:'Other office'}]}}:original(url,config));await start('/mobile/workspace?view=home&suite=channels');await wrapper.get('[aria-label="Browse channels"]').trigger('click');await flushPromises();const input=document.querySelector('.mm-recipient-sheet input');input.value='Boulder';input.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises();expect(document.querySelectorAll('.mm-recipient')).toHaveLength(1);expect(document.querySelector('.mm-recipient').textContent).toContain('Boulder');
});
it('exposes saved email drafts and reopens the exact draft and originating agency',async()=>{
 const original=api.get.getMockImplementation();api.get.mockImplementation(async(url,config)=>config?.params?.suite==='drafts'?{data:{items:[{key:'draft:abc',kind:'draft',id:'abc',agencyId:20,title:'Saved synthetic draft',sender:'recipient@example.invalid',preview:'Unsent content'}],counts:{drafts:{total:1,unread:0,needs:0}}}}:original(url,config));await start('/mobile/workspace?view=home&suite=drafts');expect(wrapper.text()).toContain('Saved synthetic draft');await wrapper.get('.mm-row').trigger('click');expect(wrapper.emitted('compose-email')[0][0]).toEqual({draftId:'abc',agencyId:20});
});
it('keeps Show all explicit when All starts in the unread view',async()=>{await start('/mobile/workspace?view=home&suite=all');const link=wrapper.findAll('button').find(b=>b.text()==='Show all conversations');expect(link).toBeTruthy();await link.trigger('click');await flushPromises();expect(router.currentRoute.value.query.filter).toBe('all');});

it('keeps the keyboard closed on opening Direct and shows the agency mark below a photo',async()=>{
 const original=api.get.getMockImplementation();api.get.mockImplementation((url,options)=>url.endsWith('/directory')?Promise.resolve({data:{providers:[{id:2,displayName:'Synthetic Teammate',agencyId:4,agencyName:'ITSCO',profilePhotoUrl:'photos/person.png',agencyLogoUrl:'/email-signatures/staff-html/itsco-main-logo.png'}]}}):original(url,options));
 await start();await wrapper.get('[aria-label="New direct message"]').trigger('click');await flushPromises();
 const dialog=document.querySelector('[role="dialog"]');expect(document.activeElement.tagName).toBe('BUTTON');expect(dialog.querySelector('input')).not.toBe(document.activeElement);
 expect(dialog.querySelector('.identity-agency').getAttribute('src')).toBe('/email-signatures/staff-html/itsco-main-logo.png');expect(dialog.querySelector('.identity-picture img').getAttribute('src')).toBe('/api/uploads/photos/person.png');
});
it('puts Sent and Drafts in the filter row, reuses complete received rows for Sent, and fetches unsent drafts',async()=>{
 await start();expect(wrapper.findAll('.mm-categories button').some(b=>b.text().includes('Drafts'))).toBe(false);
 const before=api.get.mock.calls.length;await wrapper.findAll('.mm-filters button').find(b=>b.text().startsWith('Sent')).trigger('click');await flushPromises();expect(router.currentRoute.value.query.filter).toBe('sent');expect(api.get.mock.calls.length).toBe(before);expect(wrapper.findAll('.mm-row')).toHaveLength(0);
 await wrapper.findAll('.mm-filters button').find(b=>b.text().startsWith('Drafts')).trigger('click');await flushPromises();expect(api.get.mock.calls.at(-1)[1].params).toMatchObject({suite:'drafts',filter:'all'});
});
it('changes unread appearance and badge before the network returns, then expires the notice',async()=>{
 let finish;api.patch.mockImplementation(()=>new Promise(resolve=>finish=resolve));await start();vi.useFakeTimers();
 await wrapper.findAll('.mm-row-tools button').find(b=>b.text()==='Mark read').trigger('click');await flushPromises();
 expect(row('Jordan').element.closest('article').classList.contains('unread')).toBe(false);expect(wrapper.get('.mm-notice').text()).toContain('Marked as read');expect(wrapper.emitted('counts').at(-1)[0].direct.unread).toBe(0);
 finish({data:{ok:true}});await flushPromises();await vi.advanceTimersByTimeAsync(4600);expect(wrapper.find('.mm-notice').exists()).toBe(false);vi.useRealTimers();
});
it('restores unread appearance on a failed read request without claiming success',async()=>{
 let fail;api.patch.mockImplementation(()=>new Promise((_,reject)=>fail=reject));await start();await wrapper.findAll('.mm-row-tools button').find(b=>b.text()==='Mark read').trigger('click');
 fail({response:{status:503,data:{error:{message:'Temporary failure'}}}});await flushPromises();expect(row('Jordan').element.closest('article').classList.contains('unread')).toBe(true);
});
it('retains horizontal category position across a conversation and count refresh',async()=>{
 await start();const tabs=wrapper.get('.mm-categories');tabs.element.scrollLeft=240;await tabs.trigger('scroll');await row('Jordan').trigger('click');await flushPromises();await back();expect(wrapper.get('.mm-categories').element.scrollLeft).toBe(240);
 let finish;api.get.mockImplementationOnce(()=>new Promise(resolve=>finish=resolve));await wrapper.get('[aria-label="Refresh messages"]').trigger('click');expect(wrapper.get('.mm-categories').text()).toContain('Direct1');finish({data:response()});await flushPromises();expect(wrapper.get('.mm-categories').element.scrollLeft).toBe(240);
});
it('pages clients and shows an explicit secure invite composer with an agency icon',async()=>{
 const original=api.get.getMockImplementation();const person={id:'4:20:client',clientId:20,agencyId:4,recipientKey:'client',displayName:'Syn* Adu*',requiresInvitation:true,agencyLogoUrl:'/email-signatures/staff-html/itsco-main-logo.png'};
 api.get.mockImplementation((url,options)=>url.includes('/messages/clients?')?Promise.resolve({data:{contacts:[{...person,id:options?.params?.page?'second':person.id}],nextPage:options?.params?.page?null:1}}):original(url,options));
 api.post.mockResolvedValue({data:{ok:true,messageId:90,threadId:40,deliveryStatus:'queued'}});
 await start('/mobile/workspace?view=home&suite=secure');await wrapper.get('[aria-label="New secure message"]').trigger('click');await flushPromises();
 const dialog=document.querySelector('[role="dialog"]');expect(dialog.querySelector('.agency-picture')).not.toBeNull();dialog.querySelectorAll('button').forEach(b=>{if(b.textContent.includes('Load more clients'))b.click();});await flushPromises();expect(api.get.mock.calls.at(-1)[1].params.page).toBe(1);
 dialog.querySelector('.mm-recipient').click();await flushPromises();expect(dialog.textContent).toContain('verify the client’s birth date');const box=dialog.querySelector('textarea');box.value='Synthetic private message';box.dispatchEvent(new Event('input',{bubbles:true}));dialog.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/api/quick-view/messages/clients/20/contact/send',expect.objectContaining({channel:'secure',invite:true,requestKey:expect.any(String),recipientKey:'client'}),expect.any(Object));expect(wrapper.get('.mm-notice').text()).toContain('queued');
});

it('opens the invitation confirmation if portal setup changes after the recipient list loaded',async()=>{
 const original=api.get.getMockImplementation();api.get.mockImplementation((url,options)=>url.includes('/messages/clients?')?Promise.resolve({data:{contacts:[{id:'4:20:guardian:9',clientId:20,agencyId:4,recipientKey:'guardian:9',displayName:'Syn* Cli*'}]}}):original(url,options));api.post.mockResolvedValue({data:{requiresInvitation:true}});
 await start('/mobile/workspace?view=home&suite=secure');await wrapper.get('[aria-label="New secure message"]').trigger('click');await flushPromises();document.querySelector('.mm-recipient').click();await flushPromises();expect(document.querySelector('[role="dialog"] textarea')).not.toBeNull();expect(router.currentRoute.value.query.threadId).toBeUndefined();expect(api.post.mock.calls).toHaveLength(1);
});

it('promotes unread categories on first load and keeps their order during count refreshes',async()=>{
 const first=response();first.counts={all:{unread:4},email:{unread:2},direct:{unread:0},secure:{unread:2},groups:{unread:0}};
 api.get.mockResolvedValue({data:first});await start();const labels=()=>wrapper.findAll('.mm-categories button').map(n=>n.text().replace(/\s+/g,' '));expect(labels().slice(0,3)).toEqual(['All4','Email2','Secure2']);
 api.get.mockResolvedValue({data:{...first,counts:{...first.counts,groups:{unread:5},secure:{unread:0}}}});await wrapper.get('[aria-label="Refresh messages"]').trigger('click');await flushPromises();expect(labels().slice(0,4)).toEqual(['All4','Email2','Secure0','Direct0']);
});
it('offers a known-contact action for unknown email and saves only after confirmation',async()=>{
 const mail={key:'email:88',id:88,kind:'email',category:'email',unknown:true,title:'Synthetic subject',sender:'Outside sender',senderEmail:'outside@example.invalid',preview:'Synthetic mail'};
 api.get.mockResolvedValue({data:{items:[mail],counts:{unknown:{total:1,unread:1}},nextCursor:null}});await start('/mobile/workspace?view=home&suite=unknown');await wrapper.findAll('button').find(n=>n.text()==='Create known contact').trigger('click');await flushPromises();expect(document.body.textContent).toContain('Save this sender');expect(api.post).not.toHaveBeenCalled();document.querySelector('[aria-label="Create known contact"] button').click();await flushPromises();expect(api.post).toHaveBeenCalledWith('/api/quick-view/messages/email/88/known-sender',{},expect.any(Object));
});


it('shows group names without personal account labels or redundant destination emails, and simplifies filters',async()=>{
 api.get.mockResolvedValue({data:{items:[{key:'email:42',id:42,kind:'email',category:'groups',title:'Synthetic ticket',sender:'External sender',groupName:'Agency Technology Team',destinationAccount:'technology@agency.invalid',preview:'Synthetic preview'}],counts:{all:{total:999,unread:27},groups:{total:111,unread:27,needs:43}}}});
 await start('/mobile/workspace?view=home&suite=groups');
 expect(wrapper.get('.mm-row-top strong').text()).toBe('Agency Technology Team');expect(wrapper.text()).not.toContain('technology@agency.invalid');
 expect(wrapper.findAll('.mm-filters button').map(b=>b.text())).toEqual(['All','Unread 27','Sent 0','Drafts —']);expect(wrapper.text()).not.toContain('Needs reply');expect(wrapper.findAll('.mm-categories button').find(b=>b.text().startsWith('All')).text()).toContain('27');
});

it('maps an older needs-reply bookmark to Unread',async()=>{await start('/mobile/workspace?view=home&suite=direct&filter=needs');expect(wrapper.findAll('.mm-filters button').find(b=>b.attributes('aria-pressed')==='true').text()).toContain('Unread');expect(api.get).toHaveBeenCalledWith('/api/quick-view/messages/inbox',expect.objectContaining({params:expect.objectContaining({filter:'unread'})}));});

it('keeps bulk selection in the three-dot actions and marks only selected conversations read',async()=>{
 await start();await wrapper.findAll('.mm-row-tools button').find(b=>b.text()==='Select multiple').trigger('click');await flushPromises();expect(wrapper.get('[aria-label="Selected conversations"]').text()).toContain('1 selected');
 await wrapper.findAll('.mm-bulk button').find(b=>b.text()==='Select all shown').trigger('click');expect(wrapper.get('.mm-bulk').text()).toContain('2 selected');
 await wrapper.findAll('.mm-bulk button').find(b=>b.text()==='Read').trigger('click');await flushPromises();expect(api.patch).toHaveBeenCalledWith('/api/quick-view/messages/chat/10/state',{read:true},expect.any(Object));expect(api.patch).toHaveBeenCalledWith('/api/quick-view/messages/chat/11/state',{read:true},expect.any(Object));expect(wrapper.find('.mm-bulk').exists()).toBe(false);expect(wrapper.find('.mm-timeline').exists()).toBe(false);
});
it('keeps failed bulk items selected rather than reporting them as archived',async()=>{
 await start();await wrapper.findAll('.mm-row-tools button').find(b=>b.text()==='Select multiple').trigger('click');await flushPromises();await wrapper.findAll('.mm-bulk button').find(b=>b.text()==='Select all shown').trigger('click');api.patch.mockImplementation(async url=>{if(url.includes('/chat/10/'))throw new Error('offline');return{data:{ok:true}};});
 await wrapper.findAll('.mm-bulk button').find(b=>b.text()==='Archive').trigger('click');await flushPromises();expect(wrapper.get('.mm-bulk').text()).toContain('1 selected');expect(wrapper.get('[role="alert"]').text()).toContain('1 conversation could not be updated');expect(wrapper.get('.mm-notice').text()).toContain('1 conversation archived');
});
it('clears bulk selection when the signed-in session changes',async()=>{await start();await wrapper.findAll('.mm-row-tools button').find(b=>b.text()==='Select multiple').trigger('click');await flushPromises();await wrapper.setProps({sessionToken:'another-scoped-session'});expect(wrapper.find('.mm-bulk').exists()).toBe(false);});

it('restores the same recently loaded inbox without refetching on return',async()=>{await start();const calls=()=>api.get.mock.calls.filter(([url])=>url.endsWith('/messages/inbox')).length;const before=calls();await wrapper.setProps({visible:false});await wrapper.setProps({visible:true});await flushPromises();expect(calls()).toBe(before);expect(wrapper.text()).toContain('Jordan Example');await wrapper.vm.refresh();await flushPromises();expect(calls()).toBe(before+1);});
it('removes an opened email from unread immediately while its save is pending',async()=>{let read=false,resolve;api.get.mockImplementation(async(url)=>({data:url.endsWith('/messages/inbox')?{items:read?[]:[{key:'email:41',id:41,kind:'email',category:'email',title:'SYNTHETIC-READ',unread:true,unreadCount:1}],counts:{all:{unread:read?0:1},email:{unread:read?0:1}}}:{}}));api.patch.mockImplementation(()=>new Promise(done=>{resolve=()=>{read=true;done({data:{}});};}));await start('/mobile/workspace?view=home&suite=email&filter=unread');const promise=wrapper.vm.markConversationRead({id:41});await flushPromises();expect(wrapper.text()).not.toContain('SYNTHETIC-READ');expect(wrapper.emitted('counts').at(-1)[0].all.unread).toBe(0);await wrapper.setProps({visible:false});await wrapper.setProps({visible:true});await flushPromises();expect(wrapper.text()).not.toContain('SYNTHETIC-READ');resolve();await promise;await flushPromises();expect(wrapper.text()).not.toContain('SYNTHETIC-READ');});
it('clears cached lists when the device session changes',async()=>{await start();api.get.mockResolvedValue({data:{items:[],counts:{}}});await wrapper.setProps({sessionToken:'another-session'});await flushPromises();expect(wrapper.text()).not.toContain('Jordan Example');});

it('shows a recent direct conversation while refreshing access and clears it if access was revoked',async()=>{await start();await wrapper.findAll('.mm-row')[0].trigger('click');await flushPromises();expect(wrapper.text()).toContain('ORIGINAL MESSAGE');await router.push('/mobile/workspace?view=home&suite=direct');await flushPromises();let reject;const old=api.get.getMockImplementation();api.get.mockImplementation((url,config)=>url.includes('/chat/threads/10/messages')?new Promise((_done,fail)=>{reject=fail;}):old(url,config));await router.push('/mobile/workspace?view=home&suite=direct&threadId=10');await flushPromises();expect(wrapper.text()).toContain('ORIGINAL MESSAGE');reject({response:{status:403,data:{error:{message:'Membership revoked'}}}});await flushPromises();expect(wrapper.text()).not.toContain('ORIGINAL MESSAGE');expect(wrapper.text()).toContain('Membership revoked');});

it('does not let a delayed category response overwrite a restored cached view',async()=>{await start();const get=api.get.getMockImplementation();let resolveEmail;api.get.mockImplementation((url,config)=>url.endsWith('/messages/inbox')&&config?.params?.suite==='email'?new Promise(resolve=>{resolveEmail=resolve;}):get(url,config));await router.push('/mobile/workspace?view=home&suite=email');await flushPromises();expect(resolveEmail).toBeTypeOf('function');await router.push('/mobile/workspace?view=home&suite=direct');await flushPromises();expect(wrapper.text()).toContain('Jordan Example');resolveEmail({data:{items:[{key:'email:44',kind:'email',id:44,title:'WRONG FILTER RESULT'}],counts:{},nextCursor:null}});await flushPromises();expect(wrapper.text()).toContain('Jordan Example');expect(wrapper.text()).not.toContain('WRONG FILTER RESULT');});

it('previews the complete secure audience and sends those exact IDs after the saved acknowledgment',async()=>{
 const fallback=api.get.getMockImplementation();
 api.get.mockImplementation(async(url,config)=>url.endsWith('/meta')?{data:{thread_id:11,agencyId:450,shared:true,sharingPolicy:'all_eligible_family',thread_type:'client_secure',participants:[{id:1,name:'Avery QA',role:'provider'},{id:2,name:'Parent One QA',role:'guardian'},{id:3,name:'Parent Two QA',role:'guardian'}]}}:url.endsWith('/secure-family-sharing-notice')?{data:{version:'2026-11-11',acknowledged:true}}:fallback(url,config));
 await start('/mobile/workspace?view=home&suite=secure&threadId=11&secure=1');
 expect(wrapper.get('[aria-label="Actual shared message recipients"]').text()).toContain('Parent One QA');expect(wrapper.text()).toContain('Parent Two QA');
 await wrapper.get('.mm-composer textarea').setValue('Synthetic shared update');await wrapper.get('.mm-composer').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/api/quick-view/chat/threads/11/messages',expect.objectContaining({body:'Synthetic shared update',expectedRecipientUserIds:[2,3]}),expect.any(Object));
});
it('does not send or erase the draft when the first shared-message notice is canceled',async()=>{
 const fallback=api.get.getMockImplementation();
 api.get.mockImplementation(async(url,config)=>url.endsWith('/meta')?{data:{thread_id:11,agencyId:450,shared:true,sharingPolicy:'all_eligible_family',participants:[{id:1,name:'Avery QA'},{id:2,name:'Parent QA'}]}}:url.endsWith('/secure-family-sharing-notice')?{data:{version:'2026-11-11',acknowledged:false,notice:{statements:['All eligible family users receive this message.']}}}:fallback(url,config));
 await start('/mobile/workspace?view=home&suite=secure&threadId=11&secure=1');await wrapper.get('.mm-composer textarea').setValue('Draft preserved');await wrapper.get('.mm-composer').trigger('submit');await flushPromises();
 expect(document.querySelector('[role="dialog"]')).not.toBeNull();
 const buttons=[...document.querySelectorAll('[role="dialog"] button')];buttons.find(button=>/cancel|not now/i.test(button.textContent))?.click();await flushPromises();
 expect(api.post.mock.calls.some(([url])=>url.endsWith('/messages'))).toBe(false);expect(wrapper.get('.mm-composer textarea').element.value).toBe('Draft preserved');
});


it('holds a direct message to preview without changing its unread state or navigation',async()=>{
 await start();const before=router.currentRoute.value.fullPath;api.post.mockClear();api.patch.mockClear();
 await row('Jordan').trigger('contextmenu');await flushPromises();const preview=document.querySelector('[aria-label="Message preview"]');
 expect(preview.textContent).toContain('ORIGINAL MESSAGE');expect(preview.textContent).toContain('Preview · stays unread');expect(preview.textContent).not.toContain('Select multiple');expect(document.activeElement).toBe(preview);
 expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(row('Jordan').classes()).not.toContain('read');expect(router.currentRoute.value.fullPath).toBe(before);
 preview.querySelector('button').click();await flushPromises();expect(document.querySelector('[aria-label="Message preview"]')).toBeNull();expect(router.currentRoute.value.fullPath).toBe(before);expect(wrapper.get('.mm-unread').text()).toBe('2');
});
it('previews email through the explicit markRead=0 endpoint and sanitizes its body',async()=>{
 const original=api.get.getMockImplementation();api.get.mockImplementation((url,options)=>url.endsWith('/messages/inbox')?Promise.resolve({data:{items:[{key:'email:41',id:41,kind:'email',category:'email',title:'SYNTHETIC-PREVIEW',unread:true}],counts:{all:{unread:1},email:{unread:1}}}}):url.endsWith('/conversations/41')?Promise.resolve({data:{messages:[{id:1,body_html:'<p>FULL SYNTHETIC BODY</p><img src=x onerror="alert(1)"><script>unsafe()</script>'}]}}):original(url,options));
 await start('/mobile/workspace?view=home&suite=email&filter=unread');await wrapper.get('.mm-row').trigger('contextmenu');await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/api/quick-view/conversations/41',expect.objectContaining({params:{markRead:'0'}}));const preview=document.querySelector('[aria-label="Message preview"]');expect(preview.textContent).toContain('FULL SYNTHETIC BODY');expect(preview.innerHTML).not.toMatch(/onerror|<script|unsafe/);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});
it('previews a thread from a touch hold without marking or navigating it',async()=>{
 const original=api.get.getMockImplementation();api.get.mockImplementation((url,options)=>url.endsWith('/messages/inbox')?Promise.resolve({data:{items:[{key:'threads:101',id:101,kind:'threads',threadId:10,parent_message_id:100,category:'threads',title:'SYNTHETIC-THREAD',unread:true}],counts:{threads:{unread:1}}}}):original(url,options));await start('/mobile/workspace?view=home&suite=threads');const before=router.currentRoute.value.fullPath;api.get.mockClear();vi.useFakeTimers();try{const hold=new Event('pointerdown',{bubbles:true});Object.defineProperties(hold,{pointerType:{value:'touch'},pointerId:{value:1},clientX:{value:40},clientY:{value:80}});wrapper.get('.mm-row').element.dispatchEvent(hold);await vi.advanceTimersByTimeAsync(550);await flushPromises();expect(document.querySelector('[aria-label="Message preview"]').textContent).toContain('ORIGINAL MESSAGE');expect(api.get).toHaveBeenCalledWith('/api/quick-view/chat/threads/10/messages',expect.objectContaining({params:{limit:'60',parentMessageId:100}}));expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();expect(router.currentRoute.value.fullPath).toBe(before);}finally{vi.useRealTimers();}
});
it('keeps secure previews concealed until explicitly revealed and clears them when hidden',async()=>{
 await start();api.get.mockClear();await row('Mi•••').trigger('contextmenu');await flushPromises();let preview=document.querySelector('[aria-label="Message preview"]');expect(preview.textContent).toContain('Reveal secure preview');expect(api.get).not.toHaveBeenCalled();
 [...preview.querySelectorAll('button')].find(b=>b.textContent==='Reveal secure preview').click();await flushPromises();preview=document.querySelector('[aria-label="Message preview"]');expect(preview.textContent).toContain('ORIGINAL MESSAGE');expect(preview.textContent).not.toContain('Jordan Example');expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();await wrapper.setProps({visible:false});expect(document.querySelector('[aria-label="Message preview"]')).toBeNull();
});
it('offers known contact or confirmed recipient-scoped spam on an unknown sender hold',async()=>{
 api.get.mockResolvedValue({data:{items:[{key:'email:41',id:41,kind:'email',category:'email',title:'SYNTHETIC-UNKNOWN',sender:'Unknown synthetic sender',unknown:true}],counts:{unknown:{unread:1}}}});await start('/mobile/workspace?view=home&suite=unknown');await wrapper.get('.mm-row').trigger('contextmenu');await flushPromises();const actions=document.querySelector('[aria-label="Conversation actions"]');expect(actions.textContent).toContain('Create known contact');expect(actions.textContent).not.toContain('Select multiple');[...actions.querySelectorAll('button')].find(b=>b.textContent==='Mark as spam').click();await flushPromises();expect(api.post).not.toHaveBeenCalled();document.querySelector('[aria-label="Mark sender as spam"] button').click();await flushPromises();expect(api.post).toHaveBeenCalledWith('/api/quick-view/messages/email/41/spam',{confirmed:true},expect.any(Object));
});
it('teaches configured actions by moving the first actual message without changing its read/archive state',async()=>{
 vi.useFakeTimers();try{await start('/mobile/workspace?view=home&suite=direct',{preferences:{swipeLeft:'unread',swipeRight:'read'}});expect(wrapper.find('.mm-swipe-guide').exists()).toBe(false);const first=wrapper.get('.mm-row.is-demonstrating');expect(first.text()).toContain('Jordan Example');expect(first.get('.mm-swipe-tip').text()).toContain('Swipe left: mark as unread. Swipe right: mark as read.');await vi.advanceTimersByTimeAsync(50);expect(first.attributes('style')).toContain('translateX(-88px)');expect(first.element.closest('.mm-swipe').textContent).toContain('Unread');await vi.advanceTimersByTimeAsync(1150);expect(first.attributes('style')).toContain('translateX(88px)');expect(first.element.closest('.mm-swipe').textContent).toContain('Read');await vi.advanceTimersByTimeAsync(3100);expect(wrapper.find('.is-demonstrating').exists()).toBe(false);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(wrapper.get('.mm-unread').text()).toBe('2');await wrapper.setProps({visible:false});await wrapper.setProps({visible:true});await flushPromises();expect(wrapper.find('.is-demonstrating').exists()).toBe(false);}finally{vi.useRealTimers();}
});
it('keeps real-row swipe guidance still for reduced motion and cancels its timers on leaving',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true}));vi.useFakeTimers();try{await start();expect(wrapper.get('.is-demonstrating').attributes('style')).toContain('translateX(0px)');await vi.advanceTimersByTimeAsync(1200);expect(wrapper.get('.is-demonstrating').attributes('style')).toContain('translateX(0px)');await wrapper.setProps({visible:false});await vi.advanceTimersByTimeAsync(3100);expect(wrapper.find('.is-demonstrating').exists()).toBe(false);expect(api.patch).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();}finally{vi.useRealTimers();}
});

it('defaults Email to Unread, while explicit All remains selectable',async()=>{
 await start('/mobile/workspace?view=home&suite=email');expect(api.get.mock.calls[0][1].params).toMatchObject({suite:'email',filter:'unread'});await router.push('/mobile/workspace?view=home&suite=email&filter=all');await flushPromises();expect(api.get.mock.calls.at(-1)[1].params.filter).toBe('all');
});
it('opens a complete Email folder directly from authorized All rows without another inbox request',async()=>{
 const email={key:'email:70',id:70,kind:'email',category:'email',title:'CACHED EMAIL',unread:true};api.get.mockResolvedValue({data:{items:[{...direct},email],counts:{all:{unread:2},email:{unread:1},direct:{unread:1}},nextCursor:null}});await start('/mobile/workspace?view=home&suite=all');const before=api.get.mock.calls.length;
 await router.push('/mobile/workspace?view=home&suite=email');await flushPromises();expect(wrapper.text()).toContain('CACHED EMAIL');expect(wrapper.text()).not.toContain('Jordan Example');expect(wrapper.text()).not.toContain('Loading your conversations');expect(api.get.mock.calls.length).toBe(before);
});
it('paints a partial cached Email folder during its own page request and never reuses the All cursor',async()=>{
 const email={key:'email:70',id:70,kind:'email',category:'email',title:'CACHED EMAIL',unread:true};let finish;api.get.mockImplementation((_url,{params})=>params.suite==='all'?Promise.resolve({data:{items:[email],counts:{all:{unread:90},email:{unread:60}},nextCursor:'ALL-CURSOR'}}):new Promise(resolve=>{finish=resolve;}));await start('/mobile/workspace?view=home&suite=all');await router.push('/mobile/workspace?view=home&suite=email');await flushPromises();expect(wrapper.text()).toContain('CACHED EMAIL');expect(wrapper.text()).not.toContain('Loading your conversations');expect(api.get.mock.calls.at(-1)[1].params).toMatchObject({suite:'email',filter:'unread',includeCounts:'0',cursor:undefined});expect(wrapper.find('.mm-load').exists()).toBe(false);
 finish({data:{items:[email,{...email,id:71,key:'email:71',title:'REST OF EMAIL'}],counts:{},nextCursor:'EMAIL-CURSOR'}});await flushPromises();expect(wrapper.text()).toContain('REST OF EMAIL');expect(wrapper.find('.mm-load').exists()).toBe(true);
});
it('reuses a completed All page for Sent without inventing sent status from the latest author',async()=>{
 const inbound={key:'email:70',id:70,kind:'email',category:'email',title:'INBOUND ONLY',unread:true},sent={...inbound,key:'email:71',id:71,title:'AUTHORED EARLIER',hasSent:true};api.get.mockResolvedValue({data:{items:[inbound,sent],counts:{all:{total:2,sent:1},email:{total:2,sent:1}},nextCursor:null}});await start('/mobile/workspace?view=home&suite=all&filter=all');const before=api.get.mock.calls.length;await router.push('/mobile/workspace?view=home&suite=email&filter=sent');await flushPromises();expect(wrapper.text()).toContain('AUTHORED EARLIER');expect(wrapper.text()).not.toContain('INBOUND ONLY');expect(api.get.mock.calls.length).toBe(before);
});
it('shares an in-flight folder request across rapid returns and warms only that folder',async()=>{
 await start();let finish;const original=api.get.getMockImplementation();api.get.mockImplementation((url,config)=>config?.params?.suite==='email'?new Promise(resolve=>{finish=resolve;}):original(url,config));await router.push('/mobile/workspace?view=home&suite=email');await flushPromises();await router.push('/mobile/workspace?view=home&suite=direct');await flushPromises();await router.push('/mobile/workspace?view=home&suite=email');await flushPromises();expect(api.get.mock.calls.filter(([_url,config])=>config?.params?.suite==='email')).toHaveLength(1);
 finish({data:{items:[{key:'email:70',id:70,kind:'email',category:'email',title:'SHARED FLIGHT',unread:true}],counts:{},nextCursor:null}});await flushPromises();expect(wrapper.text()).toContain('SHARED FLIGHT');expect(wrapper.text()).not.toContain('Jordan Example');
});
it('rejects a pre-read refresh response even after a post-read refresh has started',async()=>{
 const email={key:'email:70',id:70,kind:'email',category:'email',title:'STALE UNREAD',unread:true};api.get.mockResolvedValue({data:{items:[email],counts:{all:{unread:1},email:{unread:1}},nextCursor:null}});await start('/mobile/workspace?view=home&suite=email');let oldFinish,newFinish;api.get.mockImplementationOnce(()=>new Promise(resolve=>{oldFinish=resolve;})).mockImplementationOnce(()=>new Promise(resolve=>{newFinish=resolve;}));const old=wrapper.vm.refresh();await flushPromises();const read=wrapper.vm.markConversationRead({id:70});await flushPromises();expect(newFinish).toBeTypeOf('function');expect(wrapper.text()).not.toContain('STALE UNREAD');oldFinish({data:{items:[{...email}],counts:{all:{unread:1},email:{unread:1}},nextCursor:null}});await old;await flushPromises();expect(wrapper.text()).not.toContain('STALE UNREAD');newFinish({data:{items:[],counts:{all:{unread:0},email:{unread:0}},nextCursor:null}});await read;await flushPromises();expect(wrapper.emitted('counts').at(-1)[0].all.unread).toBe(0);
});
it('clears cached rows and counters on a delayed denied request even after moving to a cached category',async()=>{
 await start();let deny;api.get.mockImplementation(()=>new Promise((_resolve,reject)=>{deny=reject;}));await router.push('/mobile/workspace?view=home&suite=email');await flushPromises();await router.push('/mobile/workspace?view=home&suite=direct');await flushPromises();expect(wrapper.text()).toContain('Jordan Example');deny({response:{status:403,data:{error:{message:'Access revoked'}}}});await flushPromises();expect(wrapper.text()).not.toContain('Jordan Example');expect(wrapper.emitted('counts').at(-1)[0]).toEqual({});expect(JSON.stringify({...localStorage})).not.toContain('Jordan Example');
});

it('refreshes the recent Drafts folder when a conversation has a newly unsent reply',async()=>{
 const original=api.get.getMockImplementation();api.get.mockImplementation((url,config)=>config?.params?.suite==='drafts'?Promise.resolve({data:{items:[],counts:{drafts:{total:0}},nextCursor:null}}):original(url,config));await start('/mobile/workspace?view=home&suite=direct&filter=drafts');expect(wrapper.findAll('.mm-row')).toHaveLength(0);await router.push('/mobile/workspace?view=home&suite=direct&threadId=10');await flushPromises();await wrapper.get('.mm-composer textarea').setValue('NEW UNSENT REPLY');await wrapper.get('.mm-back').trigger('click');await new Promise(resolve=>setTimeout(resolve,30));await flushPromises();expect(router.currentRoute.value.query.filter).toBe('drafts');expect(wrapper.text()).toContain('NEW UNSENT REPLY');expect(api.get.mock.calls.filter(([_url,config])=>config?.params?.suite==='drafts')).toHaveLength(2);
});
