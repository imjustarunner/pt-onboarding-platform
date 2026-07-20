-- Support high-volume notification feed lookups by type, entity, event time,
-- actor, and recipient. The following migration adds the exact event
-- fingerprint used to collapse per-recipient fan-out rows.
CREATE INDEX idx_notifications_fanout_event
  ON notifications(
    type,
    agency_id,
    related_entity_type,
    related_entity_id,
    created_at,
    actor_user_id,
    user_id,
    id
  );
