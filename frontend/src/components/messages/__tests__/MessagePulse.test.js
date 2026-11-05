import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MessagePulse from '../MessagePulse.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
const data = {
  messageId: 20, sentAt: '2026-11-04T12:00:00Z', recipientCount: 2, seenCount: 1,
  noViewRecordedCount: 1, replyCount: 3, reactionCount: 2, reactions: [{ code: '👍', count: 2 }],
  recipients: [{ userId: 7, name: 'Alex Rivera', firstSeenAt: '2026-11-04T12:01:00Z' }, { userId: 9, name: 'Sam Lee', firstSeenAt: null }]
};
let wrapper;
const open = async () => { await wrapper.find('.pulse-trigger').trigger('click'); await flushPromises(); };
beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue({ data }); wrapper = mount(MessagePulse, { props: { threadId: 10, messageId: 20 }, attachTo: document.body }); });
afterEach(() => { wrapper.unmount(); document.body.innerHTML = ''; vi.useRealTimers(); });

describe('message Pulse', () => {
  it('loads seen-by details on hover and keyboard focus, keeping counts unknown until loaded', async () => {
    let resolve; api.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await wrapper.find('.message-pulse').trigger('mouseenter');
    expect(document.querySelector('[role=tooltip]').textContent).toContain('Loading seen-by details');
    expect(document.querySelector('[role=tooltip]').textContent).not.toContain('Seen by 0');
    resolve({ data }); await flushPromises();
    expect(document.querySelector('[role=tooltip]').textContent).toContain('Seen by 1 of 2');
    expect(document.querySelector('[role=tooltip]').textContent).toContain('Alex Rivera');
    expect(document.querySelector('[role=tooltip]').textContent).not.toContain('Sam Lee');
    expect(api.get).toHaveBeenCalledWith('/chat/threads/10/messages/20/pulse', { skipGlobalLoading: true });
    await wrapper.find('.pulse-trigger').trigger('keydown', { key: 'Escape' });
    expect(document.querySelector('[role=tooltip]')).toBeNull();
    await wrapper.find('.pulse-trigger').trigger('focus'); await flushPromises();
    expect(document.querySelector('[role=tooltip]')).not.toBeNull();
  });
  it('opens shared stats, filters recipients, traps focus, and restores focus on Escape', async () => {
    const trigger = wrapper.find('.pulse-trigger'); trigger.element.focus();
    await open();
    const dialog = document.querySelector('[role=dialog]');
    expect(dialog.textContent).toContain('Conversa Pulse');
    expect(dialog.textContent).toContain('Alex Rivera'); expect(dialog.textContent).toContain('Sam Lee');
    expect(dialog.textContent).toContain('exclude the sender'); expect(dialog.textContent).toContain('earlier views may not be recorded');
    const filters = dialog.querySelectorAll('.pulse-filters button');
    filters[1].click(); await flushPromises();
    expect(dialog.querySelector('.pulse-roster').textContent).toContain('Alex Rivera');
    expect(dialog.querySelector('.pulse-roster').textContent).not.toContain('Sam Lee');
    filters[2].click(); await flushPromises();
    expect(dialog.querySelector('.pulse-roster').textContent).toContain('Sam Lee');
    const first = dialog.querySelector('button'), last = [...dialog.querySelectorAll('button')].at(-1);
    first.focus(); first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(last);
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises();
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
  });
  it('shows failures without inventing zero stats and supports retry', async () => {
    api.get.mockRejectedValueOnce(new Error('offline')); await open();
    expect(document.querySelector('[role=alert]').textContent).toContain('could not be loaded');
    expect(document.querySelector('.pulse-stats')).toBeNull();
    document.querySelector('.pulse-control').click(); await flushPromises();
    expect(document.querySelector('.pulse-stats')).not.toBeNull();
  });
  it('ignores an old response after switching messages', async () => {
    let resolve; api.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await wrapper.find('.message-pulse').trigger('mouseenter');
    await wrapper.setProps({ messageId: 99 });
    resolve({ data }); await flushPromises();
    api.get.mockResolvedValueOnce({ data: { ...data, recipients: [], recipientCount: 0, seenCount: 0 } });
    await open();
    expect(document.querySelector('[role=dialog]').textContent).not.toContain('Alex Rivera');
    expect(document.querySelector('[role=dialog]').textContent).toContain('No other current recipients');
    expect(api.get).toHaveBeenLastCalledWith('/chat/threads/10/messages/99/pulse', expect.anything());
  });
  it('keeps the preview available while the pointer moves into it', async () => {
    vi.useFakeTimers();
    await wrapper.find('.message-pulse').trigger('mouseenter'); await flushPromises();
    await wrapper.find('.message-pulse').trigger('mouseleave');
    document.querySelector('[role=tooltip]').dispatchEvent(new MouseEvent('mouseenter'));
    await vi.advanceTimersByTimeAsync(150);
    expect(document.querySelector('[role=tooltip]')).not.toBeNull();
  });
});
