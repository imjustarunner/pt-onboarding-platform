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

export async function invalidateReplacementAvailability(db, providerId) {
  await db.execute('UPDATE provider_availability_reminders SET checked_at=NULL WHERE provider_id=?', [providerId]);
  await db.execute('DELETE FROM public_read_snapshots WHERE provider_id=?', [providerId]);
}
