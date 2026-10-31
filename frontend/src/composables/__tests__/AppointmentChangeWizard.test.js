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
  it('books a replacement from the change form and then requires normal review and signature', async () => {
    const { wrapper, change } = await setup();
    change.step.value = 2; change.facts.eventType = 'rescheduled'; change.context.clientId = 8;
    change.replacementBase.value = { id:4,agencyId:450,providerUserId:1433,tenantServiceId:291,serviceCode:'90834',sourceTimezone:'America/Denver',startAt:'2026-11-06 16:00:00',endAt:'2026-11-06 16:45:00',modality:'VIRTUAL',participants:[{clientId:8,role:'client'}] };
    api.get.mockResolvedValue({data:{appointments:[]}});api.put.mockResolvedValue({data:{ok:true}});api.post.mockResolvedValue({data:{appointment:{id:99,providerScheduleEventId:999}}});
    await flushPromises();
    const chooser=wrapper.find('[data-inline-reschedule]');
    expect(chooser.text()).toContain('original session changes only after you review and sign');
    expect(chooser.text()).toContain('America/Denver');
    await chooser.find('input[type="datetime-local"]').setValue('2026-11-06T14:15');
    expect(change.inlineReplacement.localStart).toBe('2026-11-06T14:15');
    await flushPromises();
    expect(wrapper.find('[data-inline-reschedule] button').attributes('disabled')).toBeUndefined();
    await wrapper.find('[data-inline-reschedule] button').trigger('click'); await flushPromises();
    expect(change.inlineReplacement.error).toBe('');
    expect(api.post).toHaveBeenCalledWith('/appointments',expect.objectContaining({startAt:'2026-11-06T14:15:00',endAt:'2026-11-06T15:00:00',serviceCode:'90834'}),expect.anything());
    expect(change.facts.replacementAppointmentId).toBe(99);
    expect(wrapper.text()).toContain('Replacement #99 is booked and selected');
    expect(change.signatureConfirmed.value).toBe(false);
    wrapper.unmount();
  });
  it('shows the actual attendance policy without claiming its agreement was signed', async () => {
    const {wrapper,change}=await setup();change.step.value=3;change.preview.value={evaluation:{policyName:'Demo attendance policy',noticeHours:24,lateFeeCents:8000,noShowFeeCents:10000},consequence:{summary:'Self-pay fee applies.'}};
    await flushPromises();const policy=wrapper.find('[data-attendance-policy]').text();
    expect(policy).toContain('24 hours');expect(policy).toContain('$80.00');expect(policy).toContain('$100.00');expect(policy).toContain('signed agreement is not verified');wrapper.unmount();
  });
  it('offers reviewed no-show notification and suppression controls without replacement booking',async()=>{
    const {wrapper,change}=await setup();change.facts.eventType='no_show';change.step.value=2;await flushPromises();
    expect(wrapper.text()).toContain('Send a missed-appointment notification?');expect(change.facts.clientFacingReason).toContain('recorded as missed');
    expect(wrapper.find('[data-inline-reschedule]').exists()).toBe(false);expect(wrapper.text()).not.toContain('Choose the new session time');wrapper.unmount();
  });
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
