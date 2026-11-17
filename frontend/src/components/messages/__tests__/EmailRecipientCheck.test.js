import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import EmailRecipientCheck from '../EmailRecipientCheck.vue';

let wrapper;
beforeEach(() => vi.useFakeTimers());
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });
const settle = async () => { await vi.advanceTimersByTimeAsync(350); await flushPromises(); };
const typo = { field: 'to', address: 'schols@itsco.health', suggestions: ['schools@itsco.health'] };

it('blocks Send while checking, explains the typo, and offers an explicit correction', async () => {
  const check = vi.fn().mockResolvedValue({ issues: [typo] });
  wrapper = mount(EmailRecipientCheck, { props: { recipients: { to: typo.address }, check } });
  expect(wrapper.emitted('blocked').at(-1)).toEqual([true]);
  await settle();
  expect(wrapper.text()).toContain('not a recognized internal mailbox');
  await wrapper.find('button').trigger('click');
  expect(wrapper.emitted('replace')).toEqual([[{ field: 'to', address: typo.address, replacement: 'schools@itsco.health' }]]);
  check.mockResolvedValue({ issues: [] });
  await wrapper.setProps({ recipients: { to: 'schools@itsco.health' } });
  await settle();
  expect(wrapper.emitted('blocked').at(-1)).toEqual([false]);
  expect(wrapper.find('section').exists()).toBe(false);
});

it('passes To, Cc and Bcc to the authenticated check without modifying them', async () => {
  const check = vi.fn().mockResolvedValue({ issues: [] });
  const recipients = { to: 'person@dpsk12.net', cc: 'schools@itsco.health', bcc: 'support@itsco.health' };
  wrapper = mount(EmailRecipientCheck, { props: { recipients, check } });
  await settle();
  expect(check).toHaveBeenCalledWith(recipients);
  expect(wrapper.emitted('replace')).toBeUndefined();
  expect(wrapper.emitted('blocked').at(-1)).toEqual([false]);
});

it('ignores an old result after the recipient changes', async () => {
  let resolveOld;
  const check = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue({ issues: [] });
  wrapper = mount(EmailRecipientCheck, { props: { recipients: { to: typo.address }, check } });
  await settle();
  await wrapper.setProps({ recipients: { to: 'schools@itsco.health' } });
  await settle();
  resolveOld({ issues: [typo] }); await flushPromises();
  expect(wrapper.emitted('blocked').at(-1)).toEqual([false]);
  expect(wrapper.text()).not.toContain(typo.address);
});

it('keeps sending blocked on verification failure and lets the author retry', async () => {
  const check = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ issues: [] });
  wrapper = mount(EmailRecipientCheck, { props: { recipients: { to: 'schools@itsco.health' }, check } });
  await settle();
  expect(wrapper.text()).toContain('Your draft can still be saved');
  expect(wrapper.emitted('blocked').at(-1)).toEqual([true]);
  await wrapper.find('button').trigger('click'); await flushPromises();
  expect(wrapper.emitted('blocked').at(-1)).toEqual([false]);
});

it('does not accept a malformed success response as verification', async () => {
  wrapper = mount(EmailRecipientCheck, { props: { recipients: { to: 'schools@itsco.health' }, check: vi.fn().mockResolvedValue({}) } });
  await settle();
  expect(wrapper.emitted('blocked').at(-1)).toEqual([true]);
  expect(wrapper.text()).toContain('could not be checked');
});

it('does not check an empty draft and clears old warnings when all recipients are removed', async () => {
  const check = vi.fn().mockResolvedValue({ issues: [typo] });
  wrapper = mount(EmailRecipientCheck, { props: { recipients: {}, check } });
  await settle(); expect(check).not.toHaveBeenCalled();
  await wrapper.setProps({ recipients: { to: typo.address } }); await settle();
  await wrapper.setProps({ recipients: {} });
  expect(wrapper.emitted('blocked').at(-1)).toEqual([false]);
  expect(wrapper.find('section').exists()).toBe(false);
});
