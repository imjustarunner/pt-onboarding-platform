import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), suspend: vi.fn(), resume: vi.fn(), capture: vi.fn(), start: vi.fn(), flush: vi.fn(), stop: vi.fn() }));
vi.mock('../../composables/consentedAudioCapture.js', () => ({ createConsentedAudioCapture: options => { m.capture(options); return { start: m.start, stop: m.stop, flush: m.flush }; } }));
vi.mock('../../services/api', () => ({ default: m }));
vi.mock('../../utils/activityTracker', () => ({ suspendInactivityTimeout: m.suspend, resumeInactivityTimeout: m.resume }));
vi.mock('../../components/supervision/SupervisionVideoRoom.vue', () => ({ default: { name: 'SupervisionVideoRoom',
  props: ['token','localRoleLabel','isHost','equalTilesWhenRemote','preserveVideoAspect','lobbyMode'], emits: ['connected','leave-request','disconnected','interview-guest-ended'], methods: { getTranscriptionStream: () => 'local microphone' }, template: '<div data-test="video" />' } }));
vi.mock('../../components/hiring/InterviewSharedChat.vue', () => ({ default: { name: 'InterviewSharedChat', props: ['endpoint'], template: '<div data-test="shared-chat">Chat with applicant</div>' } }));
import Applicant from '../teamMeeting/ApplicantInterviewView.vue';
let wrapper;
const creds = mode => ({ token: 'candidate-video', sessionId: 'interview-room', applicationId: 'project', roomMode: mode, displayName: 'Jamie Applicant' });
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); m.get.mockResolvedValue({ data: creds('main') }); m.post.mockResolvedValue({ data: {} }); });
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });
async function open() { wrapper = mount(Applicant, { props: { invitationToken: 'a'.repeat(32) } }); await flushPromises(); }
describe('minimal applicant interview', () => {
  it('joins using only the invitation endpoint and shows square video plus shared chat', async () => {
    await open();
    expect(m.get.mock.calls[0][0]).toBe(`/team-meetings/interview-applicant/${'a'.repeat(32)}/video-token`);
    expect(m.get.mock.calls.some(([url]) => /users\/me|workspace|artifacts|attendance/.test(url))).toBe(false);
    expect(wrapper.findComponent({ name:'SupervisionVideoRoom' }).props()).toMatchObject({ isHost:false, localRoleLabel:'Applicant', equalTilesWhenRemote:true, preserveVideoAspect:false });
    expect(wrapper.find('[data-test=shared-chat]').exists()).toBe(true);
    for(const text of ['Team chat','Scorecard','Transcript','Candidate materials']) expect(wrapper.text()).not.toContain(text);
  });
  it('withholds chat while waiting and changes rooms only after admission', async () => {
    m.get.mockResolvedValueOnce({ data: creds('lobby') }); await open();
    expect(wrapper.text()).toContain('waiting room'); expect(wrapper.find('[data-test=shared-chat]').exists()).toBe(false);
    m.get.mockResolvedValue({ data: { ...creds('main'), admitted:true } }); await vi.advanceTimersByTimeAsync(4000); await flushPromises();
    expect(wrapper.find('[data-test=shared-chat]').exists()).toBe(true);
  });
  it('revokes video and chat on the next poll when applicant access ends', async () => {
    await open(); m.get.mockRejectedValue({ response:{status:410} }); await vi.advanceTimersByTimeAsync(4000); await flushPromises();
    expect(wrapper.text()).toContain('Your interview has ended'); expect(wrapper.find('[data-test=video]').exists()).toBe(false);
    expect(wrapper.find('[data-test=shared-chat]').exists()).toBe(false); expect(wrapper.text()).not.toContain('Rejoin'); expect(m.resume).toHaveBeenCalled();
  });
  it('can leave and rejoin without staff login', async () => {
    await open(); wrapper.findComponent({ name:'SupervisionVideoRoom' }).vm.$emit('leave-request'); await flushPromises();
    expect(wrapper.text()).toContain('Rejoin interview'); await wrapper.find('button').trigger('click'); await flushPromises();
    expect(wrapper.find('[data-test=video]').exists()).toBe(true);
    expect(m.post.mock.calls.some(([,body])=>body.action==='leave')).toBe(true);
  });
  it('does not resurrect a video token request after leaving the page', async () => {
    let resolve; m.get.mockImplementation(()=>new Promise(r=>{resolve=r;}));
    wrapper=mount(Applicant,{props:{invitationToken:'a'.repeat(32)}}); wrapper.unmount();
    resolve({data:creds('main')}); await flushPromises(); expect(m.suspend).not.toHaveBeenCalled();
  });
  it('captures only an admitted applicant’s local microphone and shows a visible leave button', async () => {
    m.get.mockResolvedValueOnce({ data: creds('lobby') }); await open();
    wrapper.findComponent({ name: 'SupervisionVideoRoom' }).vm.$emit('connected'); await flushPromises();
    expect(m.capture).not.toHaveBeenCalled();
    m.get.mockResolvedValue({ data: { ...creds('main'), admitted: true } });
    await vi.advanceTimersByTimeAsync(4000); await flushPromises();
    wrapper.findComponent({ name: 'SupervisionVideoRoom' }).vm.$emit('connected'); await flushPromises();
    expect(m.capture).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: `/team-meetings/interview-applicant/${'a'.repeat(32)}` }));
    expect(m.capture.mock.calls[0][0].getStream()).toBe('local microphone');
    expect(m.start).toHaveBeenCalledOnce();
    await wrapper.get('.leave-meeting').trigger('click'); await flushPromises();
    expect(m.flush).toHaveBeenCalled(); expect(wrapper.find('[data-test=video]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Rejoin interview');
    expect(m.post.mock.calls.every(([url]) => !url.includes('/complete'))).toBe(true);
  });
  it('shows the latest question and removes it when cleared without replacing the video', async () => {
    m.get.mockImplementation(async url => ({ data: url.endsWith('/question') ? { question: { id: 4, text: 'First question?' } } : creds('main') }));
    await open(); const video = wrapper.find('[data-test=video]').element;
    expect(wrapper.text()).toContain('First question?');
    m.get.mockImplementation(async url => ({ data: url.endsWith('/question') ? { question: { id: 5, text: 'Next question?' } } : creds('main') }));
    await vi.advanceTimersByTimeAsync(2000); await flushPromises();
    expect(wrapper.text()).not.toContain('First question?'); expect(wrapper.text()).toContain('Next question?');
    m.get.mockImplementation(async url => ({ data: url.endsWith('/question') ? { question: { id: 6, text: '' } } : creds('main') }));
    await vi.advanceTimersByTimeAsync(2000); await flushPromises();
    expect(wrapper.find('.interview-question').exists()).toBe(false);expect(wrapper.find('[data-test=video]').element).toBe(video);
  });
});
