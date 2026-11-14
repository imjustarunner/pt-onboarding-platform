export function officeCalendarSummary(row, buildingName, officeLabel) {
  if (row.client_id && row.clinical_session_id) {
    // Room resources and shared calendars must not disclose client names or notes.
    return ['Client session', row.booking_agency_name, `${buildingName} • ${officeLabel}`].filter(Boolean).join(' · ');
  }
  return `${buildingName} • ${officeLabel} — ${String(row.slot_state).toUpperCase() === 'ASSIGNED_BOOKED' ? 'Booked' : 'Assigned'}`;
}
