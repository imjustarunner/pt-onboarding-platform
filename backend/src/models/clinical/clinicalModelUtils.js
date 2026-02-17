export const RETENTION_FIELDS = `
  is_deleted,
  deleted_at,
  deleted_by_user_id,
  is_legal_hold,
  legal_hold_reason,
  legal_hold_set_at,
  legal_hold_set_by_user_id,
  legal_hold_released_at,
  legal_hold_released_by_user_id
`;

export function normalizeIncludeDeleted(includeDeleted) {
  if (includeDeleted === true || includeDeleted === 1) return true;
  const raw = String(includeDeleted || '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

