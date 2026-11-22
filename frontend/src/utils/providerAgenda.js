/** Project canonical appointment details already authorized by schedule-summary. */
export function providerAgendaSummary(summary = {}) {
  summary ||= {};
  const offices = summary.officeEvents || [], events = summary.scheduleEvents || [];
  const officeByAppointment = new Map(offices.filter(e => Number(e.appointmentId) > 0).map(e => [Number(e.appointmentId), e]));
  const officeById = new Map(offices.map(e => [Number(e.id), e]));
  const eventAppointments = new Set(events.map(e => Number(e.appointmentId)).filter(id => id > 0));
  const project = (event, office = null) => {
    const e = { ...office, ...event };
    const client = String(e.clientName || '').trim();
    const clinical = Number(e.appointmentId) > 0 || Number(e.clientId) > 0 || e.isClientSession;
    const location = e.locationLabel || [e.buildingName, e.roomLabel].filter(Boolean).join(' · ');
    return { ...e,
      startAt: e.appointmentStartAt || e.startAt,
      endAt: e.appointmentEndAt || e.endAt,
      title: clinical ? (client || e.title || 'Client session') : e.title,
      locationLabel: location,
      isClientSession: Boolean(clinical)
    };
  };
  return { ...summary,
    officeEvents: offices.filter(e => !eventAppointments.has(Number(e.appointmentId))).map(e => project(e)),
    scheduleEvents: events.map(e => project(e, officeByAppointment.get(Number(e.appointmentId)) || officeById.get(Number(e.officeEventId))))
  };
}
