import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Thread from '../UnifiedConversationThread.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { post: vi.fn(), get: vi.fn() } }));
const detail = (id = 1) => ({
  conversation: { id, channel: 'email', subject: 'Group question', inbox_from_email: 'messages@itsco.health', draft_body: 'My draft' },
  context: { participants: [{ is_primary: true, email: 'support@itsco.health' }] },
  messages: [{ id: 10, direction: 'inbound', from: { email: 'alice@example.org' }, to: [{ email: 'messages@itsco.health' }], cc: [{ email: 'bob@example.org' }], body_html: '<p>Hello</p><img src="x" onerror="alert(1)"><script>alert(2)</script>' }]
});
const recipients = { props: ['modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' };
let wrapper;
beforeEach(() => { vi.clearAllMocks(); api.post.mockResolvedValue({ data: {} }); });
afterEach(() => { wrapper?.unmount(); });
const button = (text) => wrapper.findAll('button').find((b) => b.text() === text);
const render = () => { wrapper = mount(Thread, { props: { detail: detail(), agencyId: 2 }, global: { stubs: { DirectoryRecipientInput: recipients } } }); };
describe('email conversation composer', () => {
  it('hydrates an initially open thread without autosaving initialization as a new draft', () => {
    render();
    expect(wrapper.find('textarea').element.value).toBe('My draft');
    expect(wrapper.find('.uc-addr input').element.value).toBe('alice@example.org');
    expect(wrapper.emitted('draft')).toBeUndefined();
  });
  it('shows actual reply-all recipients and clears them when switching to forward', async () => {
    render();
    await button('Reply all').trigger('click');
    expect(wrapper.findAll('.uc-addr input').slice(0, 3).map((i) => i.element.value)).toEqual(['alice@example.org', 'bob@example.org', '']);
    await button('Forward').trigger('click');
    expect(wrapper.findAll('.uc-addr input').slice(0, 3).map((i) => i.element.value)).toEqual(['', '', '']);
  });
  it('sanitizes incoming email HTML', () => {
    render();
    expect(wrapper.find('.uc-msg-body').html()).toContain('Hello');
    expect(wrapper.find('.uc-msg-body').html()).not.toMatch(/onerror|<script/);
  });
  it('attaches draft edits to the conversation being edited', async () => {
    render();
    await wrapper.find('textarea').setValue('Reply for thread one');
    expect(wrapper.emitted('draft').at(-1)).toEqual(['Reply for thread one', 1]);
    await wrapper.setProps({ detail: detail(2) });
    expect(wrapper.emitted('draft')).toHaveLength(1);
  });
  it('does not send to a newly selected thread when preflight finishes late', async () => {
    let finish;
    api.post.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render();
    await button('Send').trigger('click');
    await wrapper.setProps({ detail: detail(2) });
    finish({ data: {} });
    await flushPromises();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(wrapper.find('textarea').element.value).toBe('My draft');
  });
});
