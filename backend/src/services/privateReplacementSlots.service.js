import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

// One shared pool can be offered to several clients. No client identity is
// returned by this calendar/availability projection.
export async function readPrivateReplacementSlots(db, providerId) {
  const [rows] = await db.execute(`SELECT s.*,
    (SELECT COUNT(DISTINCT o.client_id) FROM appointment_replacement_offer_slots os JOIN appointment_replacement_offers o ON o.id=os.offer_id
      WHERE os.slot_id=s.id AND os.released_at IS NULL AND o.status='open' AND o.expires_at>UTC_TIMESTAMP()) AS invited_count,
    (SELECT MAX(o.expires_at) FROM appointment_replacement_offer_slots os JOIN appointment_replacement_offers o ON o.id=os.offer_id
      WHERE os.slot_id=s.id AND os.released_at IS NULL AND o.status='open' AND o.expires_at>UTC_TIMESTAMP()) AS expires_at,
    EXISTS(SELECT 1 FROM appointment_replacement_offers o JOIN public_appointment_requests r ON r.id=o.request_id
      WHERE o.selected_slot_id=s.id AND (r.status IN ('PENDING','PENDING_EVAL') OR (r.status='APPROVED' AND o.linked_appointment_id IS NULL))) AS requested
    FROM appointment_replacement_slots s WHERE s.provider_id=? AND s.released_at IS NULL AND s.end_at>UTC_TIMESTAMP()
      AND (EXISTS (SELECT 1 FROM appointment_replacement_offer_slots os JOIN appointment_replacement_offers o ON o.id=os.offer_id
        WHERE os.slot_id=s.id AND os.released_at IS NULL AND o.status='open' AND o.expires_at>UTC_TIMESTAMP())
        OR EXISTS (SELECT 1 FROM appointment_replacement_offers o JOIN public_appointment_requests r ON r.id=o.request_id
          WHERE o.selected_slot_id=s.id AND (r.status IN ('PENDING','PENDING_EVAL') OR (r.status='APPROVED' AND o.linked_appointment_id IS NULL))))`, [providerId]);
  return rows;
}

// Fetch only after staff scheduling authorization. Never attach this projection
// to public availability, shared calendar feeds, or a client portal response.
export async function readReplacementSlotRecipients(db, slot, now = new Date()) {
  const [rows] = await db.execute(`SELECT o.id,o.appointment_id,o.client_id,o.status,o.created_at,o.expires_at,
    o.selected_slot_id,os.released_at,c.full_name,c.initials,r.modality AS selected_modality,r.status AS request_status
    FROM appointment_replacement_offer_slots os
    JOIN appointment_replacement_offers o ON o.id=os.offer_id AND o.agency_id=? AND o.provider_id=?
    JOIN clients c ON c.id=o.client_id AND c.agency_id=o.agency_id
    LEFT JOIN public_appointment_requests r ON r.id=o.request_id
    WHERE os.slot_id=? ORDER BY o.created_at DESC,o.id DESC`, [slot.agency_id, slot.provider_id, slot.id]);
  const iso = value => value ? parseUtcDate(value).toISOString() : null;
  const [deliveries] = await db.execute(`SELECT n.appointment_id,n.client_id,n.status AS queue_status,n.fire_at,
    d.channel,d.status,d.recipient_address,d.sent_at,uc.delivered_at,uc.opened_at
    FROM appointment_replacement_offer_slots os JOIN appointment_replacement_offers o ON o.id=os.offer_id
    JOIN appointment_schedule_notices n ON n.appointment_id=o.appointment_id AND n.client_id=o.client_id
    LEFT JOIN appointment_schedule_notice_deliveries d ON d.batch_id=n.batch_id
    LEFT JOIN user_communications uc ON uc.id=d.communication_id
    WHERE os.slot_id=? AND o.agency_id=? AND o.provider_id=? AND n.event_type IN ('canceled','rescheduled')
    ORDER BY n.id,d.id`, [slot.id,slot.agency_id,slot.provider_id]);
  const [views] = await db.execute(`SELECT v.offer_id,v.first_viewed_at,v.last_viewed_at,u.first_name,u.last_name
    FROM appointment_replacement_offer_views v JOIN appointment_replacement_offer_slots os ON os.offer_id=v.offer_id
    JOIN appointment_replacement_offers o ON o.id=v.offer_id JOIN users u ON u.id=v.user_id
    WHERE os.slot_id=? AND o.agency_id=? AND o.provider_id=?`, [slot.id,slot.agency_id,slot.provider_id]);
  const [events] = await db.execute(`SELECT e.* FROM appointment_replacement_events e
    JOIN appointment_replacement_offer_slots os ON os.offer_id=e.offer_id JOIN appointment_replacement_offers o ON o.id=e.offer_id
    WHERE os.slot_id=? AND o.agency_id=? AND o.provider_id=? ORDER BY e.id`, [slot.id,slot.agency_id,slot.provider_id]);
  return rows.map(row => {
    let status = row.status;
    if (row.selected_slot_id && Number(row.selected_slot_id) !== Number(slot.id)) status = 'selected_other_time';
    else if (['requested', 'confirmed'].includes(status)) status = row.request_status === 'APPROVED' ? 'confirmed' : row.request_status === 'PENDING' || row.request_status === 'PENDING_EVAL' ? 'requested' : status;
    else if (slot.released_at || row.released_at) status = 'released';
    else if (status === 'open' && +parseUtcDate(row.expires_at) <= +now) status = 'expired';
    return { offerId: Number(row.id), appointmentId: Number(row.appointment_id), clientId: Number(row.client_id),
      clientName: row.full_name || row.initials || 'Client', offeredAt: iso(row.created_at), expiresAt: iso(row.expires_at),
      status,
      deliveries: deliveries.filter(d => Number(d.appointment_id) === Number(row.appointment_id) && Number(d.client_id) === Number(row.client_id))
        .map(d => ({ channel:d.channel, status:d.status || d.queue_status, recipient:d.recipient_address, queuedFor:iso(d.fire_at), sentAt:iso(d.sent_at), deliveredAt:iso(d.delivered_at), openedAt:iso(d.opened_at) })),
      views: views.filter(v => Number(v.offer_id) === Number(row.id)).map(v => ({ name:[v.first_name,v.last_name].filter(Boolean).join(' '), firstViewedAt:iso(v.first_viewed_at), lastViewedAt:iso(v.last_viewed_at) })),
      outcomes: events.filter(e => Number(e.offer_id) === Number(row.id)).map(e => ({ status:e.event_type, text:e.outcome_text, recordedAt:iso(e.created_at), providerEmailStatus:e.email_status, providerEmailSentAt:iso(e.email_sent_at) })),
      selectedModality: Number(row.selected_slot_id) === Number(slot.id) ? row.selected_modality || null : null };
  });
}

export async function invalidateReplacementAvailability(db, providerId) {
  await db.execute('UPDATE provider_availability_reminders SET checked_at=NULL WHERE provider_id=?', [providerId]);
  await db.execute('DELETE FROM public_read_snapshots WHERE provider_id=?', [providerId]);
}
