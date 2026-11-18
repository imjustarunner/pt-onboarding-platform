import { describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
vi.mock('../../services/api.js', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
import api from '../../services/api.js';
import AppointmentChangeWizard from '../../components/schedule/AppointmentChangeWizard.vue';
import { useAppointmentChange } from '../useAppointmentChange.js';
async function setup(workflow = null) {
  api.get.mockResolvedValue({ data: { workflow } });
  const change = useAppointmentChange(); await change.openWizard({ appointmentId: 4 });
  return { change, wrapper: mount(AppointmentChangeWizard, { props: { change }, global: { stubs: { teleport: true, AppointmentReschedulePanel: true } } }) };
}
describe('appointment change wizard controls', () => {
  it('moves the selected appointment through the two-step reschedule panel', async () => {
    const {wrapper,change}=await setup();
    change.step.value=2;change.facts.eventType='rescheduled';await flushPromises();
    const panel=wrapper.findComponent({name:'AppointmentReschedulePanel'});
    expect(panel.exists()).toBe(true);expect(panel.props('appointmentId')).toBe(4);
    expect(wrapper.find('[data-inline-reschedule]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Review & Sign');
    const result={appointment:{id:4},pendingApproval:false};
    panel.vm.$emit('saved',result);await flushPromises();
    expect(wrapper.emitted('completed')).toEqual([[result]]);expect(change.open.value).toBe(false);
    wrapper.unmount();
  });
  it('shows the actual attendance policy without claiming its agreement was signed', async () => {
    const {wrapper,change}=await setup();change.step.value=3;change.preview.value={evaluation:{policyName:'Demo attendance policy',noticeHours:24,lateFeeCents:8000,noShowFeeCents:10000},consequence:{summary:'Self-pay fee applies.'}};
    await flushPromises();const policy=wrapper.find('[data-attendance-policy]').text();
    expect(policy).toContain('24 hours');expect(policy).toContain('$80.00');expect(policy).toContain('$100.00');expect(policy).toContain('signed agreement is not verified');wrapper.unmount();
  });
  it('offers reviewed no-show notification and suppression controls without replacement booking',async()=>{
    const {wrapper,change}=await setup();change.facts.eventType='no_show';change.step.value=2;await flushPromises();
    expect(change.facts.initiator).toBe('client');expect(wrapper.text()).toContain('Send a missed-appointment notification?');expect(change.facts.clientFacingReason).toContain('recorded as missed');
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

it('shows separate future-visit and office-retention controls, then every date before signature',async()=>{
 const {wrapper,change}=await setup();change.step.value=2;change.facts.eventType='canceled';change.cancellationOptions.value={seriesAvailable:true,officeReservationAvailable:true,singleClient:true};await flushPromises();
 const fields=wrapper.find('[data-cancellation-scope]');expect(fields.text()).toContain('This and future visits');expect(fields.text()).toContain('Keep my office reserved');expect(fields.text()).toContain('Release the office time');
 change.facts.cancellationScope='future';change.step.value=4;change.preview.value={seriesChange:{count:2,totalFeeCents:0,appointments:[{id:4,when:'Sunday, Nov 29 at 11 AM',classification:'advance_cancel',feeCents:0,narrative:'First signed note preview.'},{id:5,when:'Sunday, Dec 27 at 11 AM',classification:'advance_cancel',feeCents:0,narrative:'Second signed note preview.'}]}};await flushPromises();
 expect(wrapper.find('[data-series-cancellation-review]').text()).toContain('2 visits');expect(wrapper.findAll('.acw-series-note')).toHaveLength(2);expect(wrapper.text()).toContain('Second signed note preview.');expect(wrapper.find('.acw-signature').text()).toContain('every cancellation note');wrapper.unmount();
});
