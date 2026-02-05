-- Expand client status enum to include packet workflow values
ALTER TABLE clients
  MODIFY COLUMN status ENUM(
    'PENDING_REVIEW',
    'ACTIVE',
    'ON_HOLD',
    'DECLINED',
    'ARCHIVED',
    'PACKET',
    'SCREENER',
    'RETURNING'
  ) DEFAULT 'PENDING_REVIEW' NOT NULL;
