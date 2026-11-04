import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
import Panel from '../MeetingDialInPanel.vue';
const reply = (id = 7) => ({ enabled: true, isHost: true, userId: id, participants: [{ id: 7, name: 'Host' }, { id: 8, name: 'Invitee' }], calls: [], details: { number: '+12025550123', pin: id === 7 ? '0000000007' : '0000000008', name: id === 7 ? 'Host' : 'Invitee', oneTapUrl: 'tel:+12025550123,,0000000007%23', text: `Private invitation for ${id}` } });
let wrapper;
beforeEach(() => { vi.useFakeTimers(); api.get.mockReset().mockResolvedValue({ data: reply() }); api.post.mockReset().mockResolvedValue({ data: { status: 'sent' } }); });
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const render = async () => { wrapper = mount(Panel, { props: { meetingType: 'supervision', meetingId: 5 } }); await flushPromises(); return wrapper; };
const button = text => wrapper.findAll('button').find(node => node.text() === text);
describe('personal telephone invitations', () => {
  it('selects the participant before sending their PIN and locks duplicate clicks', async () => {
    await render(); expect(wrapper.text()).toContain('0000000007');
    api.get.mockResolvedValueOnce({ data: reply(8) }); await wrapper.get('select').setValue(8); await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith('/supervision/sessions/5/dial-in', { params: { userId: 8 } });
    expect(wrapper.text()).toContain('0000000008'); expect(wrapper.text()).not.toContain('0000000007');
    await button('Text dial-in').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/supervision/sessions/5/dial-in/send', expect.objectContaining({ userId: 8, channel: 'sms', requestKey: expect.any(String) }));
    expect(wrapper.text()).toContain('Text sent to Invitee.');
  });
  it('copies only the selected person’s invitation', async () => {
    const copy = vi.fn().mockResolvedValue(); vi.stubGlobal('navigator', { clipboard: { writeText: copy } });
    await render(); await button('Copy dial-in').trigger('click'); await flushPromises();
    expect(copy).toHaveBeenCalledWith('Private invitation for 7');
    expect(wrapper.text()).toContain('only with the named participant');
  });
  it('shows admission and transcription failures without claiming capture is active', async () => {
    api.get.mockResolvedValue({ data: { ...reply(), calls: [{ id: 'call1', name: 'Invitee', state: 'waiting' }, { id: 'call2', name: 'Host', state: 'connected', audio_status: 'unavailable' }] } });
    await render(); expect(wrapper.text()).toContain('1 waiting'); expect(wrapper.text()).toContain('transcription unavailable');
    await button('Admit').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/supervision/sessions/5/dial-in/calls/call1', { action: 'admit' });
  });
  it('does not expose sharing another person’s PIN to ordinary attendees', async () => {
    api.get.mockResolvedValue({ data: { ...reply(8), isHost: false, participants: [] } });
    await render(); expect(wrapper.find('select').exists()).toBe(false); expect(wrapper.text()).toContain('0000000008');
  });
  it('distinguishes held delivery from a sent message', async () => {
    api.post.mockResolvedValue({ data: { status: 'pending' } }); await render();
    await button('Email dial-in').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('Delivery is pending'); expect(wrapper.text()).not.toContain('Email sent');
  });
  it('explains dormant readiness to the host without exposing controls or any PIN', async () => {
    api.get.mockResolvedValue({data:{enabled:false,isHost:true,reason:'Telephone joining needs dedicated Voice configuration.',missing:['dedicated Voice application']}});
    await render();expect(wrapper.text()).toContain('dedicated Voice application');
    expect(wrapper.find('select').exists()).toBe(false);expect(wrapper.findAll('button')).toHaveLength(0);
    expect(api.post).not.toHaveBeenCalled();expect(wrapper.text()).not.toContain('Personal PIN');
  });
  it('hides unavailable or ended telephone access and clears polling on unmount', async () => {
    api.get.mockResolvedValue({ data: { enabled: false } }); await render(); expect(wrapper.find('section').exists()).toBe(false);
    api.get.mockResolvedValue({ data: reply() }); await wrapper.setProps({ meetingId: 6 }); await flushPromises();
    expect(wrapper.find('section').exists()).toBe(true);
    api.get.mockRejectedValue({ response: { status: 410 } }); await vi.advanceTimersByTimeAsync(10000); await flushPromises();
    expect(wrapper.find('section').exists()).toBe(false); wrapper.unmount();
    const calls = api.get.mock.calls.length; await vi.advanceTimersByTimeAsync(30000); expect(api.get.mock.calls.length).toBe(calls);
  });
});
