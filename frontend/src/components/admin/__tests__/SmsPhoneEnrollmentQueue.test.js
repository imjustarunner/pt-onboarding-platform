import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: m }));
import Queue from '../SmsPhoneEnrollmentQueue.vue';
const item = { id: 1, phoneLastFour: '0101', status: 'pending', receivedAt: Date.now() };
beforeEach(() => {
  vi.clearAllMocks();
  m.get.mockImplementation(async url => ({ data: url.endsWith('/evidence') ? { phone: '+13035550101', numberId: 7, messageId: 'test-event', receivedAt: item.receivedAt, disclosure: { version: 'v1', disclosure: 'Original approved consent', purposes: ['reminders'], approvalReference: 'verified:test' } } : { items: [item], nextBeforeId: null } }));
  m.post.mockResolvedValue({ data: { status: 'linked' } });
});
async function open(w) { await w.findAll('button').find(b => b.text() === 'Refresh START queue').trigger('click'); await flushPromises(); await w.findAll('button').find(b => b.text() === 'Review original evidence').trigger('click'); await flushPromises(); }
it('loads masked results first and requires separate evidence review and identity confirmation', async () => {
  const w = mount(Queue, { props: { agencyId: 6 } });
  expect(m.get).not.toHaveBeenCalled(); await open(w);
  expect(w.text()).toContain('Original approved consent'); expect(w.get('button[type=submit]').element.disabled).toBe(true);
  const inputs = w.findAll('input[type=number]'); await inputs[0].setValue(22); await inputs[1].setValue(40); await w.get('input[type=checkbox]').setValue(true);
  await w.get('form').trigger('submit'); await flushPromises();
  expect(m.post).toHaveBeenCalledWith('/sms-numbers/agency/6/phone-enrollments/1/review', { userId: 22, clientId: 40, identityVerified: true });
  expect(w.text()).toContain('No account access was granted'); w.unmount();
});
it('never offers activation without an approved disclosure and clears evidence across agencies', async () => {
  const implementation = m.get.getMockImplementation();
  m.get.mockImplementation(async (...args) => args[0].endsWith('/evidence') ? { data: { phone: '+13035550101', disclosure: null } } : implementation(...args));
  const w = mount(Queue, { props: { agencyId: 6 } }); await open(w);
  expect(w.find('button[type=submit]').exists()).toBe(false); expect(w.text()).toContain('signed-consent workflow');
  await w.setProps({ agencyId: 377 }); expect(w.text()).not.toContain('+13035550101'); expect(w.find('form').exists()).toBe(false); w.unmount();
});
