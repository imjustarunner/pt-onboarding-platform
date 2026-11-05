/**
 * School staff see a comment or ticket only while their own ROI grant covered it.
 * Anything before the grant, or after it was revoked, stays hidden.
 */
export function schoolStaffCanSeeCollaborationItem(createdAt, access) {
  const granted = access?.granted_at ? new Date(access.granted_at).getTime() : NaN;
  const created = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!Number.isFinite(granted) || !Number.isFinite(created)) return false;
  if (created < granted) return false;
  if (access?.revoked_at) {
    const revoked = new Date(access.revoked_at).getTime();
    if (Number.isFinite(revoked) && created > revoked) return false;
  }
  return true;
}
