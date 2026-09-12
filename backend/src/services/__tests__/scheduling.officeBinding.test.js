import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/Appointment.model.js', () => ({ default: { findById: vi.fn(), listParticipants: vi.fn(), update: vi.fn() } }));
vi.mock('../../models/OfficeEvent.model.js', () => ({ default: { findActiveRoomConflicts: vi.fn(), createIfRoomOpen: vi.fn(), findById: vi.fn() } }));
vi.mock('../officeScheduleMaterializer.service.js', () => ({ default: { materializeWeek: vi.fn(), invalidateOffice: vi.fn() } }));
vi.mock('../appointmentContext.service.js', () => ({ ensureAppointmentContext: vi.fn() }));
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import Appointment from '../../models/Appointment.model.js';
import OfficeEvent from '../../models/OfficeEvent.model.js';
import { bindOfficeEventToAppointment, bookOfficeForAppointmentRequest } from '../officeAppointmentBinding.service.js';
const appointment = { id: 10, agencyId: 1, providerUserId: 9, status: 'scheduled', startAt: '2099-01-05 17:00:00', endAt: '2099-01-05 17:45:00', packageEntitlementId: 2 };
const event = { id: 20, office_location_id: 3, room_id: 4, booked_provider_id: 9, start_at: appointment.startAt, end_at: appointment.endAt };
const context = { appointmentId: 10, agencyId: 1, packageEntitlementId: 2 };
describe('room approval binds an existing appointment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Appointment.findById.mockResolvedValue(appointment);
    Appointment.listParticipants.mockResolvedValue([{ clientId: 8, role: 'client' }, { clientId: 12, role: 'client' }]);
    clinicalPool.execute.mockResolvedValue([[]]);
    pool.execute.mockResolvedValue([[{ id: 10 }]]);
    pool.getConnection.mockResolvedValue({ execute: vi.fn().mockResolvedValue([[{ acquired: 1 }]]), release: vi.fn() });
    OfficeEvent.findActiveRoomConflicts.mockResolvedValue([]);
    OfficeEvent.createIfRoomOpen.mockResolvedValue(event);
  });
  const bind = (changes = {}) => bindOfficeEventToAppointment({ event, context, agencyId: 1, clientId: 8, ...changes });
  it('keeps the same appointment and attaches every group encounter', async () => {
    expect(await bind()).toMatchObject({ id: 10, officeEventId: 20 });
    expect(clinicalPool.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE clinical_sessions SET office_event_id'), [20, 10, 1]);
    expect(Appointment.update).toHaveBeenCalledWith(10, { officeEventId: 20, officeLocationId: 3, roomId: 4 });
  });
  it('rejects a room from a different session time', async () => {
    await expect(bind({ event: { ...event, end_at: '2099-01-05 18:00:00' } })).rejects.toThrow('same start and end');
    expect(Appointment.update).not.toHaveBeenCalled();
  });
  it('rejects a client or package mismatch', async () => {
    await expect(bind({ clientId: 99 })).rejects.toThrow('does not match');
    await expect(bind({ context: { ...context, packageEntitlementId: 22 } })).rejects.toThrow('does not match');
  });
  it('rejects changing signed documentation to acquire an office', async () => {
    clinicalPool.execute.mockResolvedValue([[{ id: 5 }]]);
    await expect(bind()).rejects.toThrow('signed note');
    expect(Appointment.update).not.toHaveBeenCalled();
  });
  it('retries linkage to the same office without creating another clinical session', async () => {
    Appointment.findById.mockResolvedValue({ ...appointment, officeEventId: 20 });
    await bind();
    expect(clinicalPool.execute.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
  });
  it('matches a recurring request to the exact appointment occurrence', async () => {
    await bind({ context: { ...context, appointmentId: null, appointmentSeriesId: 'series-1' } });
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('recurrence_series_id'), ['series-1', 1, 9, event.start_at, event.end_at]);
  });
  it('preflights room availability before creating any booked events', async () => {
    OfficeEvent.findActiveRoomConflicts.mockResolvedValue([{ id: 99, status: 'BOOKED' }]);
    await expect(bookOfficeForAppointmentRequest({ request: { id: 6, requested_provider_id: 9, client_id: 8 }, context,
      rooms: [{ id: 4 }], office: { id: 3 }, selection: {}, actorUserId: 9 })).rejects.toThrow('No selected room');
    expect(OfficeEvent.createIfRoomOpen).not.toHaveBeenCalled();
  });
  it('keeps the requested 45-minute duration when approving a room', async () => {
    await bookOfficeForAppointmentRequest({ request: { id: 6, requested_provider_id: 9, client_id: 8 }, context,
      rooms: [{ id: 4 }], office: { id: 3 }, selection: {}, actorUserId: 9 });
    expect(OfficeEvent.createIfRoomOpen).toHaveBeenCalledWith(expect.objectContaining({ startAt: appointment.startAt, endAt: appointment.endAt }));
  });
  it('recovers an office event saved before an interrupted appointment binding', async () => {
    OfficeEvent.findActiveRoomConflicts.mockResolvedValue([{ ...event, status: 'BOOKED', client_id: 8,
      session_context_json: { appointmentId: 10, officeRequestId: 6 } }]);
    OfficeEvent.findById.mockResolvedValue(event);
    await bookOfficeForAppointmentRequest({ request: { id: 6, requested_provider_id: 9, client_id: 8 }, context,
      rooms: [{ id: 4 }], office: { id: 3 }, selection: {}, actorUserId: 9 });
    expect(OfficeEvent.createIfRoomOpen).not.toHaveBeenCalled();
    expect(Appointment.update).toHaveBeenCalledWith(10, { officeBookingRequestId: 6 });
  });
});
