-- Give per-recipient copies of one notification event the same indexed key.
-- This is generated from the complete immutable event payload, so historical
-- rows can be grouped without rewriting or deleting their audit records.
ALTER TABLE notifications
  ADD COLUMN fanout_fingerprint BINARY(32)
    GENERATED ALWAYS AS (
      UNHEX(SHA2(CONCAT_WS(
        CHAR(31),
        type,
        COALESCE(CAST(agency_id AS CHAR), '<NULL>'),
        severity,
        title,
        message,
        COALESCE(related_entity_type, '<NULL>'),
        COALESCE(CAST(related_entity_id AS CHAR), '<NULL>'),
        COALESCE(CAST(actor_user_id AS CHAR), '<NULL>'),
        COALESCE(actor_source, '<NULL>'),
        CAST(created_at AS CHAR)
      ), 256))
    ) VIRTUAL,
  ADD INDEX idx_notifications_fanout_fingerprint (fanout_fingerprint, user_id, id);
