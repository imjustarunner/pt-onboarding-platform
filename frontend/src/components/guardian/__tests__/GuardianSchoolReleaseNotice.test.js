import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import api from '../../../services/api';
import Notice from '../GuardianSchoolReleaseNotice.vue';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));

const person = { clientId: 928, childName: 'Jordan', schoolName: 'Twain Elementary School' };

describe('school release banner', () => {
  beforeEach(() => vi.clearAllMocks());
  it('tells the guardian a release is waiting in documents', async () => {
    api.get.mockResolvedValue({ data: { ready: true, schoolName: 'Twain Elementary School', publicKey: 'secret-key' } });
    const wrapper = mount(Notice, { props: { people: [person] } });
    await flushPromises();
    expect(wrapper.text()).toContain('waiting in your documents');
    expect(wrapper.text()).toContain('Jordan');
    expect(wrapper.text()).toContain('Twain Elementary School');
    expect(wrapper.text()).not.toContain('secret-key');
    expect(wrapper.find('a').exists()).toBe(false);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('open')[0]).toEqual([928]);
    wrapper.unmount();
  });

  it('stays hidden when the release is already signed', async () => {
    api.get.mockResolvedValue({ data: { ready: false, status: 'completed' } });
    const wrapper = mount(Notice, { props: { people: [person] } });
    await flushPromises();
    expect(wrapper.text()).toBe('');
    wrapper.unmount();
  });
});
