import { parseUtcDate } from './officeEventDateTime.util.js';

export function isOwnEmptyReservation(event, providerId) {
  return !event.client_id && !event.clinical_session_id && !event.billing_context_id && !Number(event.has_appointment)
    && !['CANCELLED', 'CANCELED'].includes(String(event.status).toUpperCase())
    && Number(event.booked_provider_id || event.assigned_provider_id) === Number(providerId);
}

export function ownReservationsCover(events, providerId, startAt, endAt) {
  let through = +parseUtcDate(startAt);
  for (const event of events.filter(e => isOwnEmptyReservation(e, providerId)).sort((a, b) => +parseUtcDate(a.start_at) - +parseUtcDate(b.start_at))) {
    const start = +parseUtcDate(event.start_at), end = +parseUtcDate(event.end_at);
    if (start > through) break;
    if (end > through) through = end;
    if (through >= +parseUtcDate(endAt)) return true;
  }
  return false;
}
