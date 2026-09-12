import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../models/Appointment.model.js', () => ({ default: { findByProviderScheduleEventId: vi.fn(), update: vi.fn() } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../appointmentClinicalLink.service.js', () => ({ ensureAppointmentClinicalLink: vi.fn() }));
import Appointment from '../../models/Appointment.model.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { ensureAppointmentClinicalLink } from '../appointmentClinicalLink.service.js';
import { assertAppointmentCanMove, assertProviderEventCanMove, syncAppointmentFromProviderEvent } from '../appointmentScheduleSync.service.js';
describe('calendar moves keep appointment context', () => {
  beforeEach(() => { vi.clearAllMocks(); clinicalPool.execute.mockResolvedValue([[]]); });
  it('updates clinical timing for the same appointment after a calendar move', async () => {
    Appointment.findByProviderScheduleEventId.mockResolvedValue({ id: 3 });
    await syncAppointmentFromProviderEvent({ id: 8, start_at: '2026-09-12 18:00:00', end_at: '2026-09-12 19:00:00' }, 9);
    expect(Appointment.update).toHaveBeenCalledWith(3, { startAt: '2026-09-12 18:00:00', endAt: '2026-09-12 19:00:00', updatedByUserId: 9 });
    expect(ensureAppointmentClinicalLink).toHaveBeenCalledWith(3, 9);
  });
  it('prevents moving a session with a signed note', async () => {
    clinicalPool.execute.mockResolvedValue([[{ id: 4 }]]);
    await expect(assertAppointmentCanMove({ id: 3, status: 'scheduled', clinicalSessionId: 5 })).rejects.toThrow('signed note');
  });
  it('allows non-time edits of completed appointments', async () => {
    Appointment.findByProviderScheduleEventId.mockResolvedValue({ id: 3, status: 'completed', startAt: '2026-09-12 18:00:00', endAt: '2026-09-12 19:00:00' });
    await expect(assertProviderEventCanMove(8, '2026-09-12 18:00:00', '2026-09-12 19:00:00')).resolves.toBeUndefined();
  });
});
