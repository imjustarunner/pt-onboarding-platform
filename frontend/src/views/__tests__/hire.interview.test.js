// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('../../services/api', () => ({ default: api }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 11, first_name: 'Elena', last_name: 'Cruz' } }) }));
import InterviewWorkspace from '../../components/hiring/InterviewLiveWorkspace.vue';
import InvitePreview from '../../components/hiring/InterviewInvitePreview.vue';
let wrapper;
const artifact = () => ({ flow_state_json: { sections: [{ key: 'standard', label: 'Behavioral questions', questions: [{ key: 'q1', text: 'Tell us about your experience.' }] }], completed: {} }, private_notes_json: { '11': 'My saved note' }, my_scorecard: { communication: 2 }, team_chat_json: [] });
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async url => ({ data: url.endsWith('/brief') ? { data: { candidateName: 'Jordan Applicant', role: 'Therapist', summary: { workHistory: [{ employer: 'Care Center', title: 'Counselor', startDate: '2021', endDate: '2025' }] }, documents: [] } } : url.includes('by-schedule-event') ? { data: { interview: { id: 5, candidate_user_id: 30 }, artifact: artifact(), flow: artifact().flow_state_json, template: { scorecard_criteria_json: [{ key: 'communication', label: 'Communication' }] } } } : url.endsWith('/artifacts') ? { data: artifact() } : {} }));
  api.put.mockResolvedValue({ data: { data: artifact() } }); api.post.mockResolvedValue({ data: {} });
});
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });
async function open() { wrapper = mount(InterviewWorkspace, { props: { eventId: 1 } }); await flushPromises(); return wrapper; }
const tab = label => wrapper.findAll('.ilw-tab').find(b => b.text() === label);
describe('interviewer workspace', () => {
  it('mounts a candidate sidebar created in the same render', async () => {
    wrapper = mount(defineComponent({ setup: () => () => h('div', [h('aside', { id: 'test-brief-target' }), h(InterviewWorkspace, { eventId: 1, briefTarget: '#test-brief-target' })]) }), { attachTo: document.body });
    await flushPromises();
    expect(document.querySelector('#test-brief-target').textContent).toContain('Jordan Applicant');
  });

  it('loads scoped candidate materials even without a globally selected agency', async () => { await open(); expect(api.get).toHaveBeenCalledWith('/hiring/interview-hub/interviews/5/brief', {skipGlobalLoading:true}); expect(wrapper.text()).toContain('Care Center'); expect(wrapper.text()).toContain('Jordan Applicant'); });
  it('saves only the changed question instead of replacing teammates’ maps', async () => { await open(); await wrapper.find('.ilw-check').trigger('click'); await wrapper.findAll('button').find(b => b.text() === 'Save progress').trigger('click'); await flushPromises(); expect(api.put.mock.calls[0][1]).toEqual({ completedPatch: { 'standard:q1': true } }); });
  it('autosaves private notes with server-owned author identity', async () => { await open(); vi.useFakeTimers(); await tab('Notes').trigger('click'); await wrapper.find('textarea').setValue('Only my notes'); await vi.advanceTimersByTimeAsync(850); await flushPromises(); expect(api.put.mock.calls[0][1]).toMatchObject({ myNotes: 'Only my notes' }); expect(api.put.mock.calls[0][1].privateNotesJson).toBeUndefined(); });
  it('keeps controls and unsaved text available on failed save; does not finalize', async () => { await open(); api.put.mockRejectedValue(new Error('offline')); await tab('Notes').trigger('click'); await wrapper.find('textarea').setValue('Do not lose this'); await wrapper.findAll('button').find(b => b.text() === 'Finalize scorecard').trigger('click'); await flushPromises(); expect(wrapper.find('textarea').element.value).toBe('Do not lose this'); expect(wrapper.text()).toContain('Your changes have not saved'); expect(api.post).not.toHaveBeenCalled(); expect(wrapper.find('.ilw-footer').exists()).toBe(true); });
  it('finalizes quietly without ending the interview or removing controls', async () => {
    await open();await wrapper.findAll('button').find(b => b.text() === 'Finalize scorecard').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/hiring/interview-hub/interviews/5/finalize', {agencyId:null}, {params:{},skipGlobalLoading:true});
    expect(api.post.mock.calls.some(([url])=>url.endsWith('/end-guest-access'))).toBe(false);
    expect(wrapper.text()).toContain('Scorecard finalized — interview remains open');expect(wrapper.find('.ilw-footer').exists()).toBe(true);
  });
  it('opens and closes a resume in the current page without a new window', async () => {
    const original=api.get.getMockImplementation();
    api.get.mockImplementation(async (url,...args)=>url.endsWith('/brief')?{data:{data:{candidateName:'Jordan',documents:[{id:7,title:'Resume',original_name:'Resume.pdf'}]}}}:url.endsWith('/documents/7')?{data:{url:'https://files.example/resume.pdf',mimeType:'application/pdf'}}:original(url,...args));
    const popup=vi.spyOn(window,'open').mockImplementation(()=>null);
    await open();await wrapper.findAll('button').find(b=>b.text()==='Resume' && b.element.closest('.ilw-source-card')).trigger('click');await flushPromises();
    expect(document.querySelector('.ilw-document-panel')).not.toBeNull();
    expect(document.querySelector('.ilw-document-panel iframe')?.getAttribute('src')).toBe('https://files.example/resume.pdf');
    expect(popup).not.toHaveBeenCalled();document.querySelector('.ilw-document-panel button').click();await flushPromises();
    expect(document.querySelector('.ilw-document-panel')).toBeNull();expect(wrapper.find('.ilw-footer').exists()).toBe(true);popup.mockRestore();
  });
  it('alerts for new internal messages and clears the alert when team chat opens', async () => {
    vi.useFakeTimers();const focused=vi.spyOn(document,'hasFocus').mockReturnValue(true);await open();
    api.get.mockResolvedValue({data:{data:{...artifact(),team_chat_json:[{id:'m1',authorId:12,text:'Ask about teamwork',at:'2026-10-13T15:00:00Z'}]}}});
    await vi.advanceTimersByTimeAsync(5000);await flushPromises();
    expect(document.querySelector('.ilw-chat-notice')?.textContent).toContain('New internal message');
    document.querySelector('.ilw-chat-notice button').click();await flushPromises();
    expect(document.querySelector('.ilw-chat-notice')).toBeNull();expect(wrapper.text()).toContain('Ask about teamwork');focused.mockRestore();
  });
  it('saves each interviewer’s ratings separately', async () => { await open(); await tab('Scorecard').trigger('click'); await wrapper.findAll('.ilw-star')[3].trigger('click'); await wrapper.findAll('button').find(b => b.text() === 'Save progress').trigger('click'); await flushPromises(); expect(api.put.mock.calls[0][1].myRatings).toEqual({ communication: 4 }); });
  it('appends team messages without sending a stale chat log', async () => { await open(); await tab('Team chat').trigger('click'); await wrapper.find('.ilw-chat-form input').setValue('Please ask about experience'); await wrapper.find('.ilw-chat-form').trigger('submit'); await flushPromises(); expect(api.put.mock.calls[0][1].teamMessage.text).toContain('Please ask'); expect(api.put.mock.calls[0][1].teamChatJson).toBeUndefined(); });
});
describe('invitation preview', () => {
  it('previews the actual sender and branded content in a sandboxed frame without sending', async () => { api.post.mockResolvedValue({ data: { data: { from: 'po@tenant.org', to: 'candidate@example.org', html: '<b>Branded invitation</b>' } } }); wrapper = mount(InvitePreview, { props: { agencyId: 4, candidateUserId: 30 } }); await wrapper.find('button').trigger('click'); await flushPromises(); expect(wrapper.text()).toContain('po@tenant.org'); expect(wrapper.find('iframe').attributes('sandbox')).toBe(''); expect(api.post.mock.calls[0][0]).toContain('invite-preview'); });
  it('clears stale previews after scheduling details change', async () => { api.post.mockResolvedValue({ data: { data: { from: 'po@tenant.org', html: '<b>Invitation</b>' } } }); wrapper = mount(InvitePreview, { props: { agencyId: 4, candidateUserId: 30 } }); await wrapper.find('button').trigger('click'); await flushPromises(); await wrapper.setProps({ startsAt: '2026-10-01T13:00' }); expect(wrapper.find('iframe').exists()).toBe(false); });
});
