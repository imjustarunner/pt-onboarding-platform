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
const response=()=>({items:[{...direct},{...secure}],counts:{all:{total:2,unread:2,needs:1},direct:{total:1,unread:1,needs:1},secure:{total:1,unread:1,needs:0},groups:{total:0,unread:0,needs:0}},nextCursor:null});
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
it('puts Sent and Drafts in the same filter row and sends the selected filter to the server',async()=>{
 await start();expect(wrapper.findAll('.mm-categories button').some(b=>b.text().includes('Drafts'))).toBe(false);
 await wrapper.findAll('.mm-filters button').find(b=>b.text().startsWith('Sent')).trigger('click');await flushPromises();expect(api.get.mock.calls.at(-1)[1].params).toMatchObject({suite:'direct',filter:'sent'});
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
