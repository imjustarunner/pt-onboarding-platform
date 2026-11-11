import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
import api from '../../../services/api';
import Panel from '../StaffPollsPanel.vue';
enableAutoUnmount(afterEach);
const poll = { id: 12, agencyId: 2, title: 'Staff date', question: 'Which day?', options: [{ key: '1', label: 'Tuesday' }, { key: '2', label: 'Friday' }], closesAt: '2099-11-12T18:00:00Z', timezone: 'America/Denver', closedAt: null, resultsText: false, shareResults: true, resultsVisibility: 'after_close', canVote: true };
const saved = { key: '1', original: '1', label: 'Tuesday', source: 'sms', receivedAt: '2026-11-09T18:00:00Z' };
beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue({ data: [structuredClone(poll)] }); api.post.mockResolvedValue({ data: { ok: true } }); api.put.mockResolvedValue({ data: { resultsText: true } }); });
afterEach(() => vi.useRealTimers());
async function panel(props = {}) { const w = mount(Panel, { props: { agencyId: 2, ...props } }); await flushPromises(); return w; }
async function past(w) { w.get('details').element.open = true; await w.get('details').trigger('toggle'); await w.findAll('.poll-tabs button')[1].trigger('click'); }
it('discovers active polls before opening, expands automatically, and advertises the next deadline with Conversa branding', async () => {
  const w = await panel();
  expect(api.get).toHaveBeenCalledWith('/me/staff-polls', { params: { agencyId: 2 }, skipGlobalLoading: true });
  expect(w.get('details').element.open).toBe(true); expect(w.get('details').classes()).toContain('needs-vote');
  expect(w.get('img').attributes('alt')).toBe('Conversa'); expect(w.text()).toContain('1 needs your vote');
  expect(w.text()).toContain('Next deadline'); expect(w.get('time').attributes('datetime')).toBe(poll.closesAt);
  expect(api.post).not.toHaveBeenCalled(); expect(api.put).not.toHaveBeenCalled();
});
it('requires an explicit submit and keeps the readable vote receipt on the active poll', async () => {
  const w = await panel(); await w.get('input[type=radio]').setValue(true); expect(api.post).not.toHaveBeenCalled();
  api.get.mockResolvedValue({ data: [{ ...poll, myResponse: { ...saved, source: 'in_app' } }] });
  await w.get('form').trigger('submit'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/me/company-events/12/respond', { responseKey: '1', agencyId: 2 }, { params: { agencyId: 2 } });
  expect(w.get('.poll-answer').text()).toBe('Tuesday'); expect(w.text()).toContain('Voted in the app');
  expect(w.findAll('article')).toHaveLength(1); expect(w.find('form').exists()).toBe(false);
  expect(w.get('details').classes()).not.toContain('needs-vote'); expect(w.text()).toContain('You voted');
});
it('opens only the email-linked poll and never substitutes another one', async () => {
  api.get.mockResolvedValue({ data: [poll, { ...poll, id: 13, title: 'Another poll' }] });
  const w = await panel({ pollId: '12' }); expect(w.get('details').element.open).toBe(true);
  expect(w.findAll('article')).toHaveLength(1); expect(w.text()).not.toContain('Another poll'); expect(api.post).not.toHaveBeenCalled();
  await w.setProps({ pollId: '99' }); await flushPromises(); expect(w.text()).toContain('unavailable for your account'); expect(w.find('article').exists()).toBe(false);
});
it('shows only votes for the private event using the API linkedEventId contract',async()=>{
  api.get.mockResolvedValue({data:[{...poll,linkedEventId:7},{...poll,id:13,title:'Another event vote',linkedEventId:8},{...poll,id:14,title:'Standalone vote'}]});
  const w=await panel({linkedEventId:7});expect(w.findAll('article')).toHaveLength(1);expect(w.text()).not.toContain('Another event vote');expect(w.text()).not.toContain('Standalone vote');
  await w.setProps({linkedEventId:8});await flushPromises();expect(w.findAll('article')).toHaveLength(1);expect(w.text()).toContain('Another event vote');
});
it('retains compatible event filtering and uses the stable private event link when available',async()=>{
  const privateUrl='https://app.example.com/company-events/7/staff/private';
  api.get.mockResolvedValue({data:[{...poll,linkedEvent:{id:7,available:true,title:'Anniversary',staffPageUrl:privateUrl}},{...poll,id:13,title:'Unrelated',linkedEvent:{id:8,available:true}}]});
  const w=await panel({linkedEventId:7});expect(w.findAll('article')).toHaveLength(1);expect(w.get('.poll-linked-event a').attributes('href')).toBe(privateUrl);expect(w.text()).not.toContain('Unrelated');
});
it('keeps optional result texts unchecked until requested and restores the choice after a rejected save', async () => {
  const w = await panel(); const input = w.get('.poll-text-preference input');
  expect(input.element.checked).toBe(false); expect(api.put).not.toHaveBeenCalled();
  await input.setValue(true); await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/me/staff-polls/12/results-preference', { resultsText: true }, { params: { agencyId: 2 } });
  api.put.mockRejectedValue(new Error('failed')); await input.setValue(false); await flushPromises();
  expect(input.element.checked).toBe(true); expect(w.get('[role=alert]').text()).toContain('Unable');
});
it.each([false, true])('renders accessible live/final bar charts with counts, percentages, and the participant choice (closed: %s)', async closed => {
  api.get.mockResolvedValue({ data: [{ ...poll, closedAt: closed ? '2026-11-09T19:00:00Z' : null, resultsVisibility: 'live', myResponse: saved,
    results: [{ key: '1', label: 'Tuesday', total: 2 }, { key: '2', label: 'Friday', total: 3 }] }] });
  const w = await panel(); if (closed) await past(w);
  expect(w.text()).toContain(closed ? 'Final results' : 'Live results'); expect(w.text()).toContain('5 votes counted');
  expect(w.get('.poll-bar--mine').text()).toContain('Tuesday'); expect(w.get('.poll-bar--mine').text()).toContain('40%');
  expect(w.findAll('.poll-bar-fill').map(bar => bar.attributes('style'))).toEqual(['width: 40%;', 'width: 60%;']);
  expect(w.get('.poll-results').attributes('aria-label')).toContain('Staff date');
  if (closed) { expect(w.find('form').exists()).toBe(false); expect(w.find('.poll-text-preference').exists()).toBe(false); }
});
it('honors private totals even if a stale response includes results, while preserving the participant’s own text', async () => {
  api.get.mockResolvedValue({ data: [{ ...poll, shareResults: false, closedAt: '2026-11-09T19:00:00Z', myResponse: { ...saved, key: '__UNCLASSIFIED__', original: 'Monday after lunch', label: 'Monday after lunch', bucketKey: '1' }, results: [{ key: '1', total: 99 }] }] });
  const w = await panel(); await past(w);
  expect(w.text()).toContain('Monday after lunch'); expect(w.text()).toContain('Counted as Tuesday'); expect(w.text()).toContain('private');
  expect(w.find('.poll-bars').exists()).toBe(false); expect(w.find('.poll-text-preference').exists()).toBe(false);
});
it('accepts a written answer and allows an explicit change while the poll is open', async () => {
  api.get.mockResolvedValue({ data: [{ ...poll, allowOther: true, myResponse: saved }] });
  const w = await panel(); await w.findAll('button').find(b => b.text() === 'Change my vote').trigger('click');
  await w.get('input[value="__other"]').setValue(true); await w.get('textarea').setValue('Next week');
  await w.get('form').trigger('submit'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/me/company-events/12/respond', expect.objectContaining({ responseKey: 'Next week' }), expect.anything());
});
it('refreshes a text vote on focus without hiding its card or showing the numeric reply as the answer', async () => {
  const w = await panel(); api.get.mockResolvedValue({ data: [{ ...poll, myResponse: saved }] });
  window.dispatchEvent(new Event('focus')); await flushPromises();
  expect(w.get('.poll-answer').text()).toBe('Tuesday'); expect(w.text()).toContain('Voted by text'); expect(w.text()).toContain('Nov 9');
  expect(w.find('form').exists()).toBe(false); expect(w.findAll('article')).toHaveLength(1);
});
it('checks for new polls while collapsed and reopens for a newly arriving poll, respecting a manual collapse otherwise', async () => {
  vi.useFakeTimers(); api.get.mockResolvedValue({ data: [] }); const w = await panel(); expect(w.get('details').element.open).toBe(false);
  api.get.mockResolvedValue({ data: [poll] }); await vi.advanceTimersByTimeAsync(30000); await flushPromises(); expect(w.get('details').element.open).toBe(true);
  w.get('details').element.open = false; await w.get('details').trigger('toggle');
  await vi.advanceTimersByTimeAsync(30000); await flushPromises(); expect(w.get('details').element.open).toBe(false);
  api.get.mockResolvedValue({ data: [poll, { ...poll, id: 13 }] });
  await vi.advanceTimersByTimeAsync(30000); await flushPromises(); expect(w.get('details').element.open).toBe(true);
  w.unmount();
});
it('shows an internal View event link only when event details are available', async () => {
  api.get.mockResolvedValue({ data: [{ ...poll, linkedEvent: { id: 90, title: 'Holiday dinner', startsAt: poll.closesAt, available: true } }] });
  const w = await panel(); expect(w.get('.poll-linked-event a').attributes('href')).toBe('/staff-events/90?agencyId=2');
  expect(w.get('.poll-linked-event').text()).toContain('Holiday dinner');
  api.get.mockResolvedValue({ data: [{ ...poll, linkedEvent: { available: false } }] });
  window.dispatchEvent(new Event('focus')); await flushPromises();
  expect(w.find('.poll-linked-event a').exists()).toBe(false); expect(w.get('.poll-linked-event').text()).toContain('when available');
});
it('keeps an SMS-only response read-only if the API does not authorize online voting', async () => {
  api.get.mockResolvedValue({ data: [{ ...poll, canVote: false, myResponse: saved }] }); const w = await panel();
  expect(w.find('form').exists()).toBe(false); expect(w.text()).not.toContain('Change my vote');
});
it('ignores a previous agency’s late response after switching context', async () => {
  let oldResolve; api.get.mockReturnValueOnce(new Promise(resolve => { oldResolve = resolve; }));
  const w = mount(Panel, { props: { agencyId: 2 } });
  api.get.mockResolvedValue({ data: [{ ...poll, agencyId: 3, title: 'New agency poll' }] });
  await w.setProps({ agencyId: 3 }); await flushPromises(); oldResolve({ data: [poll] }); await flushPromises();
  expect(w.text()).toContain('New agency poll'); expect(w.text()).not.toContain('Staff date');
});
it('does not claim all caught up when the initial poll check fails', async () => {
  api.get.mockRejectedValue(new Error('Unavailable')); const w = await panel();
  expect(w.get('details').element.open).toBe(true); expect(w.get('summary').text()).toContain('Polls unavailable');
  expect(w.get('[role=alert]').text()).toContain('Unable to load'); expect(w.get('summary').text()).not.toContain('All caught up');
});
it('lets the owner schedule a closing time directly on the dashboard without sending a vote', async () => {
  api.get.mockResolvedValue({ data: [{ ...poll, canManage: true, canVote: false }] });
  const w = await panel(); expect(w.get('summary').text()).not.toContain('needs your vote');
  await w.get('.poll-owner-controls input').setValue('2099-11-13T12:00');
  await w.get('.poll-owner-controls form').trigger('submit'); await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/me/staff-polls/12/closing', { closesAt: new Date('2099-11-13T12:00').toISOString() }, { params: { agencyId: 2 } });
  expect(api.post).not.toHaveBeenCalled(); expect(w.get('[role=status]').text()).toContain('Closing time saved');
});
it('lets the owner close immediately and removes editing controls after closure', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  api.get.mockResolvedValue({ data: [{ ...poll, canManage: true, myResponse: saved }] }); const w = await panel();
  api.get.mockResolvedValue({ data: [{ ...poll, canManage: true, myResponse: saved, closedAt: '2026-11-09T18:00:00Z' }] });
  await w.get('.poll-close-now').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/me/staff-polls/12/close', {}, { params: { agencyId: 2 } });
  expect(w.text()).not.toContain('Change my vote'); expect(w.find('.poll-close-now').exists()).toBe(false);
  expect(w.text()).toContain('Voting is closed');
});
it('keeps owner actions hidden from participants and preserves a vote when a late edit is rejected', async () => {
  api.get.mockResolvedValue({ data: [{ ...poll, myResponse: saved }] }); const w = await panel();
  expect(w.find('.poll-owner-controls').exists()).toBe(false);
  await w.findAll('button').find(b => b.text() === 'Change my vote').trigger('click');
  await w.get('input[value="2"]').setValue(true);
  api.post.mockRejectedValue({ response: { data: { error: { message: 'Voting has closed. Your previous response is unchanged.' } } } });
  await w.get('.poll-vote-form').trigger('submit'); await flushPromises();
  expect(w.get('.poll-answer').text()).toBe('Tuesday'); expect(w.get('[role=alert]').text()).toContain('Voting has closed');
});
it('labels private totals as organizer-only when the viewer owns the poll', async () => {
  api.get.mockResolvedValue({ data: [{ ...poll, canManage: true, canVote: false, shareResults: false, results: [{ key: '1', label: 'Tuesday', total: 2 }] }] });
  const w = await panel(); expect(w.text()).toContain('Organizer totals'); expect(w.text()).toContain('Only organizers can see');
});
it('records an app view only when the expanded poll is actually visible',async()=>{
 let intersect;vi.stubGlobal('IntersectionObserver',class{constructor(callback){intersect=callback}observe(){}unobserve(){}disconnect(){}});
 const w=await panel();expect(api.post).not.toHaveBeenCalled();
 const rect=vi.spyOn(w.get('.poll-card-header').element,'getBoundingClientRect').mockReturnValue({top:20,bottom:70,height:50});
 intersect();await flushPromises();expect(api.post).toHaveBeenCalledWith('/me/staff-polls/12/viewed',{}, {params:{agencyId:2},skipGlobalLoading:true});
 w.get('details').element.open=false;await w.get('details').trigger('toggle');api.post.mockClear();intersect();await flushPromises();expect(api.post).not.toHaveBeenCalled();
 rect.mockRestore();vi.unstubAllGlobals();
});
