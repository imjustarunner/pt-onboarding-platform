import { describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
vi.mock('../../services/api.js', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
import api from '../../services/api.js';
import AppointmentChangeWizard from '../../components/schedule/AppointmentChangeWizard.vue';
import { useAppointmentChange } from '../useAppointmentChange.js';
async function setup(workflow = null) {
  api.get.mockResolvedValue({ data: { workflow } });
  const change = useAppointmentChange(); await change.openWizard({ appointmentId: 4 });
  return { change, wrapper: mount(AppointmentChangeWizard, { props: { change }, global: { stubs: { teleport: true } } }) };
}
describe('appointment change wizard controls', () => {
  it('shows the client message separately from the internal note before signing', async () => {
    const { wrapper, change } = await setup();
    change.step.value = 4; change.facts.eventType = 'canceled'; change.facts.clientFacingReason = 'Your provider is unavailable.';
    change.facts.followUpAction = 'client_contact_support'; await flushPromises();
    expect(wrapper.text()).toContain('Client message to review'); expect(wrapper.text()).toContain('Your provider is unavailable.');
    expect(wrapper.text()).toContain('contact our support team'); wrapper.unmount();
  });
  it('keeps completion visible with notification failures and a safe retry option', async () => {
    const { wrapper, change } = await setup(); change.step.value = 4; change.signatureConfirmed.value = true; await flushPromises();
    api.post.mockResolvedValue({ data: { ok: true, narrative: 'Signed.', notificationDelivery: { sent: 0, skipped: 1, deliveries: [{ id: 5, clientId: 8, channel: 'email', status: 'skipped', reason: 'No email consent' }] } } });
    await wrapper.findAll('button').find(b => b.text().includes('Sign & Complete')).trigger('click'); await flushPromises();
    expect(change.open.value).toBe(true); expect(wrapper.text()).toContain('need staff follow-up'); expect(wrapper.text()).toContain('Recheck and retry');
    expect(wrapper.text()).not.toContain('Sign & Complete'); wrapper.unmount();
  });
  it('Save Draft performs a save before closing', async () => {
    const { wrapper, change } = await setup(); api.put.mockResolvedValue({ data: { ok: true } });
    await wrapper.findAll('button').find((b) => b.text() === 'Save Draft').trigger('click'); await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/appointments/4/change/draft', expect.anything(), expect.anything());
    expect(change.open.value).toBe(false); wrapper.unmount();
  });
  it('requires the attestation to enable Sign & Complete', async () => {
    const { wrapper, change } = await setup(); change.step.value = 4; await flushPromises();
    const sign = wrapper.findAll('button').find((b) => b.text().includes('Sign & Complete'));
    expect(sign.attributes('disabled')).toBeDefined();
    await wrapper.find('input[type="checkbox"]').setValue(true);
    expect(wrapper.findAll('button').find((b) => b.text().includes('Sign & Complete')).attributes('disabled')).toBeUndefined();
    expect(wrapper.text()).toContain('does not create an insurance claim'); wrapper.unmount();
  });
  it('renders the signed note without editable fields or a second signing action', async () => {
    const { wrapper } = await setup({ status: 'completed', facts: { eventType: 'canceled' }, narrative: 'Signed cancellation note.' });
    expect(wrapper.text()).toContain('Signed cancellation note.'); expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Sign & Complete'); wrapper.unmount();
  });
});
