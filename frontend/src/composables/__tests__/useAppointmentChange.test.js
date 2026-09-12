import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../services/api.js', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
import api from '../../services/api.js';
import { useAppointmentChange } from '../useAppointmentChange.js';
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: { workflow: null } }); });
describe('appointment change workflow', () => {
  it('saves facts on the server and restores a draft when reopened', async () => {
    const change = useAppointmentChange(); await change.openWizard({ appointmentId: 4, context: { clientId: 8 } });
    change.facts.eventType = 'canceled'; change.facts.initiator = 'client'; change.facts.reasons = ['illness'];
    api.put.mockResolvedValue({ data: { ok: true } });
    expect(await change.saveDraft()).toBe(true);
    expect(api.put).toHaveBeenCalledWith('/appointments/4/change/draft', expect.objectContaining({ clientId: 8, eventType: 'canceled' }), expect.anything());
    const facts = api.put.mock.calls[0][1]; change.closeWizard();
    api.get.mockResolvedValue({ data: { workflow: { status: 'draft', facts } } });
    await change.openWizard({ appointmentId: 4 });
    expect(change.facts.reasons).toEqual(['illness']); expect(change.context.clientId).toBe(8);
  });
  it('keeps the form open when saving fails', async () => {
    const change = useAppointmentChange(); await change.openWizard({ appointmentId: 4 });
    api.put.mockRejectedValue(new Error('offline'));
    expect(await change.saveDraft()).toBe(false); expect(change.open.value).toBe(true); expect(change.error.value).toBeTruthy();
  });
  it('does not advance through a failed consequence preview', async () => {
    const change = useAppointmentChange(); await change.openWizard({ appointmentId: 4 });
    change.facts.eventType = 'canceled'; api.post.mockRejectedValue(new Error('offline'));
    await change.goNext(); expect(change.step.value).toBe(1);
  });
  it('requires signature confirmation and sends the no-show reason-known selection', async () => {
    const change = useAppointmentChange(); await change.openWizard({ appointmentId: 4 });
    change.facts.eventType = 'no_show'; change.facts.reasonKnown = false;
    await change.complete(); expect(api.post).not.toHaveBeenCalled();
    change.signatureConfirmed.value = true; api.post.mockResolvedValue({ data: { ok: true } });
    await change.complete();
    expect(api.post).toHaveBeenCalledWith('/appointments/4/change/complete', expect.objectContaining({ reasonKnown: false, signatureConfirmed: true }), expect.anything());
  });
  it('offers replacement sessions by date and title for the same client', async () => {
    const change = useAppointmentChange(); await change.openWizard({ appointmentId: 4, context: { clientId: 8 } });
    change.facts.eventType = 'rescheduled';
    api.post.mockResolvedValue({ data: { preview: { appointment: { agencyId: 2 } } } });
    api.get.mockResolvedValue({ data: { appointments: [
      { id: 4, status: 'confirmed' },
      { id: 5, status: 'confirmed', title: 'Tutoring', startAt: '2026-09-15 17:00:00' },
      { id: 6, status: 'no_show' }
    ] } });
    await change.goNext();
    expect(change.replacements.value).toEqual([{ id: 5, label: expect.stringContaining('Tutoring') }]);
    expect(api.get).toHaveBeenLastCalledWith('/appointments', expect.objectContaining({ params: expect.objectContaining({ clientId: 8, agencyId: 2 }) }));
  });
  it('reopens a completed change as its signed nonbillable session note', async () => {
    api.get.mockResolvedValue({ data: { workflow: { status: 'completed', facts: { eventType: 'canceled' }, narrative: 'Signed cancellation note.' } } });
    const change = useAppointmentChange(); await change.openWizard({ appointmentId: 4 });
    expect(change.step.value).toBe(4); expect(change.localNarrative.value).toBe('Signed cancellation note.');
  });
});
