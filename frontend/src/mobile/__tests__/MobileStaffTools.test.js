import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('axios', () => ({ default: api }));
import Support from '../components/MobileSupportMessages.vue';
import LiveChat from '../components/MobileLiveChat.vue';
let wrapper;
const props = { apiBase: '/api/quick-view', sessionToken: 'synthetic', visible: true };
const ticket = { key: 'ticket:1', id: 1, kind: 'ticket', agencyId: 450, title: 'Synthetic ticket', source: 'email', status: 'open', at: '2026-11-11T18:00:00Z' };
const chat = { id: '11111111-2222-4333-8444-555555555555', siteSlug: 'synthetic', name: 'Synthetic website', lastVisitorMessageId: 8, lastMessageId: 8 };
const detail = { visitorAvailable:true, site: { name: 'Synthetic website' }, canReply: true, messages: [{ id: 8, sender: 'visitor', body: 'Synthetic question', createdAt: '2026-11-11T18:00:00Z' }], quickReplies: [{ label: 'Welcome', body: 'Synthetic welcome' }], pageLinks: [{ label: 'Contact', url: 'https://example.invalid/contact' }] };
beforeEach(() => {
  vi.resetAllMocks(); api.post.mockResolvedValue({ data: {} });
  api.get.mockImplementation(async url => url.includes('support') ? { data: url.endsWith('/feed') ? { items: [ticket], agencies: [{ id: 450, name: 'Synthetic QA' }] } : { detail: { ticket: { subject: 'Synthetic ticket', status: 'open' }, messages: [{ id: 2, body: 'Synthetic ticket content' }] } } }
    : { data: url.endsWith('/live-chat') ? { sessions: [chat], sites: [{ slug: 'synthetic', name: 'Synthetic website', agencyId: 450 }], agencies: [{ id: 450, name: 'Synthetic QA' }] } : detail });
});
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); });
const button = text => wrapper.findAll('button').find(b => b.text() === text);

it('opens canonical support details and returns to a cached list with filters intact', async () => {
  wrapper = mount(Support, { props }); await flushPromises();
  await wrapper.get('.ms-row').trigger('click'); await flushPromises(); expect(wrapper.text()).toContain('Synthetic ticket content');
  await button('‹ Back').trigger('click'); expect(wrapper.get('.ms-row').text()).toContain('Synthetic ticket');
  const calls = api.get.mock.calls.length; await wrapper.setProps({ visible: false }); await wrapper.setProps({ visible: true }); await flushPromises(); expect(api.get.mock.calls).toHaveLength(calls);
});

it('preserves an unsuccessful support reply and sends only on explicit submit', async () => {
  wrapper = mount(Support, { props }); await flushPromises(); await wrapper.get('.ms-row').trigger('click'); await flushPromises();
  await wrapper.get('textarea').setValue('Synthetic unsent reply'); expect(api.post).not.toHaveBeenCalled();
  api.post.mockRejectedValueOnce({ response: { status: 409, data: { error: { message: 'Thread changed; review the new message.' } } } });
  await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('Thread changed'); expect(wrapper.get('textarea').element.value).toBe('Synthetic unsent reply');
  expect(api.post.mock.calls[0][0]).toBe('/api/quick-view/staff-tools/support/ticket/1/reply');
});

it('renders failed sources explicitly and keeps other support history available', async () => {
  api.get.mockResolvedValue({ data: { items: [{ ...ticket, kind: 'communication', key: 'communication:4', id: 4, source: 'email · reminder' }], agencies: [{ id: 450, name: 'Synthetic QA' }], errors: [{ agencyId: 450, type: 'ticket', message: 'Ticket service unavailable' }] } });
  wrapper = mount(Support, { props }); await flushPromises(); expect(wrapper.text()).toContain('Ticket service unavailable'); expect(wrapper.findAll('.ms-row')).toHaveLength(1);
});

it('shows readable sent email content without exposing its stylesheet or executing sender HTML', async () => {
  const sent = { ...ticket, kind: 'communication', id: 4, key: 'communication:4' };
  api.get.mockImplementation(async url => ({ data: url.endsWith('/feed') ? { items: [sent] } : { detail: {
    recipient_address: 'synthetic@example.invalid', delivery_status: 'sent', body: '<html><head><style>@media(max-width:600px){.email-card{width:100%}}</style><script>alert("bad")</script></head><body><p>Your <strong>message</strong> is waiting &amp; ready.</p><a href="https://example.invalid/portal" onclick="alert(1)">Open portal</a><img src="https://example.invalid/tracker.png" onerror="alert(1)"></body></html>'
  } } }));
  wrapper = mount(Support, { props }); await flushPromises(); await wrapper.get('.ms-row').trigger('click'); await flushPromises();
  const body = wrapper.get('.support-body'); expect(body.text()).toContain('Your message is waiting & ready.');
  expect(body.text()).not.toMatch(/@media|email-card|alert/); expect(body.find('strong').text()).toBe('message');
  expect(body.find('script,style,[onclick],[onerror],img').exists()).toBe(false);
  expect(body.get('a').attributes()).toMatchObject({ href: 'https://example.invalid/portal', rel: 'noopener noreferrer' });
  expect(api.post).not.toHaveBeenCalled(); expect(wrapper.find('form').exists()).toBe(false);
});

it('preserves literal SMS text and renders original ticket requests safely', async () => {
  api.get.mockImplementation(async url => ({ data: url.endsWith('/feed') ? { items: [ticket] } : { detail: {
    ticket: { question: '<style>.hidden{display:none}</style><p>Original request</p>' },
    messages: [{ id: 2, body_text: 'Use <client> & confirm 3 < 5.\nSecond line.' }]
  } } }));
  wrapper = mount(Support, { props }); await flushPromises(); await wrapper.get('.ms-row').trigger('click'); await flushPromises();
  expect(wrapper.findAll('.support-body')[0].text()).toBe('Original request');
  expect(wrapper.findAll('.support-body')[1].text()).toBe('Use <client> & confirm 3 < 5.\nSecond line.');
});

it('starts Live Chat offline and requires an explicit online action to enable sending', async () => {
  wrapper = mount(LiveChat, { props }); await flushPromises(); expect(wrapper.text()).toContain('Offline'); expect(api.post).not.toHaveBeenCalled();
  await wrapper.get('.lc-row').trigger('click'); await flushPromises(); expect(wrapper.text()).toContain('Synthetic question'); expect(button('Send message').attributes('disabled')).toBeDefined();
  await button('Go online').trigger('click'); await flushPromises(); expect(api.post).toHaveBeenCalledWith('/api/quick-view/staff-tools/live-chat/availability', { available: true, agencyId: undefined }, expect.objectContaining({ headers: { 'X-Quick-View-Session': 'synthetic' } }));
  expect(wrapper.get('textarea').attributes('disabled')).toBeUndefined();
});

it('inserts quick responses for review and never sends them until submit', async () => {
  wrapper = mount(LiveChat, { props }); await flushPromises(); await button('Go online').trigger('click'); await flushPromises(); await wrapper.get('.lc-row').trigger('click'); await flushPromises();
  await wrapper.get('.lc-compose select').setValue('Synthetic welcome'); expect(wrapper.get('textarea').element.value).toBe('Synthetic welcome');
  expect(api.post.mock.calls.some(([url]) => url.endsWith('/messages'))).toBe(false);
  api.post.mockImplementation(async url => ({ data: url.endsWith('/messages') ? { ...detail, messages: [...detail.messages, { id: 9, sender: 'staff', body: 'Synthetic welcome' }] } : {} }));
  await wrapper.get('form').trigger('submit'); await flushPromises(); expect(api.post.mock.calls.find(([url]) => url.endsWith('/messages'))[1]).toMatchObject({ body: 'Synthetic welcome' }); expect(wrapper.get('textarea').element.value).toBe('');
});

it('confirms per-user removal and preserves explicit online availability when the component is removed', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  wrapper = mount(LiveChat, { props }); await flushPromises(); await button('Go online').trigger('click'); await flushPromises(); await wrapper.get('.lc-row').trigger('click'); await flushPromises();
  await button('Remove from my list').trigger('click'); await flushPromises(); expect(api.post.mock.calls.some(([url]) => url.endsWith('/dismiss'))).toBe(false);
  window.confirm.mockReturnValue(true); await button('Remove from my list').trigger('click'); await flushPromises(); expect(api.post.mock.calls.find(([url]) => url.endsWith('/dismiss'))[1]).toEqual({ confirmed: true });
  wrapper.unmount(); wrapper = null; await flushPromises(); expect(api.post.mock.calls.some(([url,body])=>url.endsWith('/availability')&&body.available===false)).toBe(false);
});

it('restores the saved online choice and never opts out on background or unmount',async()=>{
 api.get.mockResolvedValue({data:{sessions:[],sites:[],agencies:[],available:true,backgroundReady:true}});
 wrapper=mount(LiveChat,{props});await flushPromises();expect(wrapper.text()).toContain('Go offline');
 vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));await flushPromises();
 wrapper.unmount();wrapper=null;await flushPromises();expect(api.post.mock.calls.some(([url,body])=>url.endsWith('/availability')&&body.available===false)).toBe(false);
});
it('does not advertise a departed visitor as an active conversation',async()=>{
 api.get.mockResolvedValue({data:{sessions:[{...chat,visitorLeft:true}],sites:[],agencies:[],available:false}});wrapper=mount(LiveChat,{props});await flushPromises();expect(wrapper.find('.lc-row').exists()).toBe(false);await wrapper.get('.lc-tools input').setValue(true);expect(wrapper.find('.lc-row').exists()).toBe(true);
});

it('returns a closed ticket to Open tickets, preserves agency and does not reopen its detail',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true);wrapper=mount(Support,{props});await flushPromises();const selects=wrapper.findAll('select');await selects[0].setValue('450');await flushPromises();await wrapper.get('.ms-row').trigger('click');await flushPromises();const before=api.get.mock.calls.filter(([url])=>url.endsWith('/ticket/1')).length;await button('Close ticket').trigger('click');await flushPromises();expect(wrapper.find('.ms-detail').exists()).toBe(false);expect(wrapper.findAll('select')[1].element.value).toBe('ticket');expect(wrapper.findAll('select')[2].element.value).toBe('open');expect(api.get.mock.calls.filter(([url])=>url.endsWith('/ticket/1'))).toHaveLength(before);expect(api.get.mock.calls.at(-1)[1].params).toMatchObject({agencyId:'450',type:'ticket',status:'open'});expect(wrapper.text()).toContain('Ticket closed.');
});
it('keeps a ticket open after a failed close',async()=>{vi.spyOn(window,'confirm').mockReturnValue(true);wrapper=mount(Support,{props});await flushPromises();await wrapper.get('.ms-row').trigger('click');await flushPromises();api.post.mockRejectedValue({response:{data:{error:{message:'Close failed; try again.'}}}});await button('Close ticket').trigger('click');await flushPromises();expect(wrapper.find('.ms-detail').exists()).toBe(true);expect(wrapper.text()).toContain('Close failed');});
it('shows SMS as a back-and-forth thread with the contact, staff sender, main number and readable status',async()=>{
 const sms={...ticket,key:'sms:8',kind:'sms',id:8,status:'open',title:'Synthetic contact'};api.get.mockImplementation(async url=>({data:url.endsWith('/feed')?{items:[sms]}:{detail:{conversation:{subject:'Synthetic contact',status:'open',inbox_display_name:'QA main number'},messages:[{id:1,direction:'inbound',from:{name:'Synthetic contact'},body_text:'Incoming text'},{id:2,direction:'outbound',author_first_name:'Jordan',author_last_name:'QA',body_text:'Reply from staff',send_status:'sent'}]}}}));wrapper=mount(Support,{props});await flushPromises();expect(wrapper.get('.ms-row').text()).toContain('Open');await wrapper.get('.ms-row').trigger('click');await flushPromises();expect(wrapper.get('.ms-sms-heading').text()).toContain('Texting with Synthetic contact');expect(wrapper.get('.ms-sms-heading').text()).toContain('QA main number');expect(wrapper.get('.ms-inbound').text()).toContain('Incoming text');expect(wrapper.get('.ms-outbound').text()).toContain('Jordan QA');expect(wrapper.get('.ms-outbound').text()).toContain('Sent');
});
