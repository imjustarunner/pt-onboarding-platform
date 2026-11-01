import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: m }));
import Panel from '../ClientAffiliatedContactsPanel.vue';
const contact = { id: 8, contact: { fullName: 'Grandparent QA', email: 'controlled@example.test', phone: '+13035550100' }, smsRemindersEnabled: true, smsOptIn: false, smsConsentStatus: 'pending' };
beforeEach(() => { vi.resetAllMocks(); m.get.mockResolvedValue({ data: { items: [] } }); });
describe('additional reminder contact consent display', () => {
  it('shows Pending before START and blocks resend after STOP', async () => {
    m.get.mockResolvedValue({ data: { items: [contact, { ...contact, id: 9, smsConsentStatus: 'stopped' }] } });
    const wrapper = mount(Panel, { props: { clientId: 2297, mode: 'guardian' } });
    await flushPromises();
    expect(wrapper.text()).toContain('PENDING — not opted in');
    expect(wrapper.text()).toContain('STOPPED');
    const buttons = wrapper.findAll('button').filter(button => button.text().includes('opt-in invitation'));
    expect(buttons).toHaveLength(2);
    expect(buttons[0].attributes('disabled')).toBeUndefined();
    expect(buttons[1].attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('They do not need a portal account');
  });
  it('keeps uncertain delivery held and never calls it opted in', async () => {
    m.get.mockResolvedValue({ data: { items: [{ ...contact, smsInvitationStatus: 'uncertain' }] } });
    const wrapper = mount(Panel, { props: { clientId: 2297, mode: 'guardian' } });
    await flushPromises();
    expect(wrapper.text()).toContain('Delivery needs review');
    expect(wrapper.findAll('button').find(button => button.text().includes('opt-in invitation')).attributes('disabled')).toBeDefined();
  });
  it('reports blocked notification without saying it was sent', async () => {
    m.post.mockResolvedValue({ data: { smsInvitationResult: { status: 'blocked', sent: false } } });
    const wrapper = mount(Panel, { props: { clientId: 2297, mode: 'guardian' } });
    await flushPromises();
    await wrapper.findAll('button').find(button => button.text() === 'Add contact').trigger('click');
    await wrapper.find('input[type="text"]').setValue('Grandparent QA');
    const ack = wrapper.findAll('input[type="checkbox"]').at(-1);
    await ack.setValue(true);
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('Text invitation was not sent');
    expect(wrapper.text()).not.toContain('notification email was sent');
    expect(m.post.mock.calls[0][0]).toBe('/guardian-portal/clients/2297/contacts');
    expect(m.post.mock.calls[0][1].recipientPermissionToInvite).toBe(false);
  });
});
