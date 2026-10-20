const emailKey = value => String(value || '').trim().toLowerCase();
const sameInstant = (a, b) => a != null && b != null && Number.isFinite(+new Date(a)) && +new Date(a) === +new Date(b);

/**
 * A room-resource reservation lives on the provider's primary Google calendar.
 * For an owner-only work mirror, keep that reservation as the single visible
 * event. Shared readers and private ICS subscribers still need a complete feed.
 * Never infer identity from a title or a time overlap alone.
 */
export async function filterPrimaryOfficeCopies({ events, publication, ownerEmail, readers, getPrimaryEvent }) {
  const owner = emailKey(ownerEmail);
  if (publication.calendar_kind !== 'work' || !owner || !Array.isArray(readers)
      || !readers.length || readers.some(reader => emailKey(reader.email) !== owner)) return events;

  const output = [];
  for (const event of events) {
    const source = event.officeReservation;
    if (!source || !source.googleEventId || emailKey(source.calendarEmail) !== owner
        || !source.roomResourceEmail || !source.id || !source.roomId
        || event.key !== `work:${publication.agency_id}:office:${source.id}`) {
      output.push(event);
      continue;
    }
    let native;
    try {
      native = await getPrimaryEvent(owner, source.googleEventId);
    } catch (error) {
      // A missing native event needs its mirror back. Authentication, quota and
      // network failures abort sync before any writes; uncertainty must not
      // remove events or recreate duplicates on each transient failure.
      if (![404, 410].includes(Number(error.code || error.response?.status))) throw error;
    }
    const properties = native?.extendedProperties?.private || {};
    const resource = native?.attendees?.find(attendee =>
      attendee.resource === true && emailKey(attendee.email) === emailKey(source.roomResourceEmail));
    const matches = native?.id === source.googleEventId && native.status === 'confirmed'
      && emailKey(native.organizer?.email) === owner
      && String(properties.pt_office_event_id) === String(source.id)
      && String(properties.pt_office_id) === String(source.roomId)
      && String(properties.pt_building_id) === String(source.buildingId)
      && properties.pt_slot_state === 'ASSIGNED_BOOKED'
      && resource?.responseStatus === 'accepted'
      && sameInstant(native.start?.dateTime, event.start)
      && sameInstant(native.end?.dateTime, event.end);
    if (!matches) output.push(event);
  }
  return output;
}
