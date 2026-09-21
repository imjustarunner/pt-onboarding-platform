import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Card from '../RememberedGoogleAccount.vue';

describe('remembered Google account card', () => {
  it('offers one-click continuation, a different username, and removal', async () => {
    const wrapper = mount(Card, { props: { account: { username: 'example@example.test', displayName: 'Example Member' } } });
    expect(wrapper.find('h3').text()).toBe('Example Member');
    expect(wrapper.find('.account-avatar').text()).toBe('EM');
    for (const [label, event] of [['Continue with Google', 'continue'], ['Use another username', 'switch'], ['Forget this account', 'forget']]) {
      await wrapper.findAll('button').find(button => button.text().includes(label)).trigger('click');
      expect(wrapper.emitted(event)).toHaveLength(1);
    }
    await wrapper.setProps({ busy: true });
    expect(wrapper.findAll('button').every(button => button.attributes('disabled') !== undefined)).toBe(true);
    wrapper.unmount();
  });
});
