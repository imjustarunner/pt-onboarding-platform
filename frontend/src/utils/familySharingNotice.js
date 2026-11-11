export const FAMILY_SHARING_REQUIRED_EVENT = 'auricwell:family-sharing-notice-required';

// A rejected send stays rejected. Only closed notice metadata enters this event;
// drafts, recipient names, request URLs and message bodies are never forwarded.
export function dispatchFamilySharingNoticeRequired(error) {
  const detail = error?.response?.data?.error;
  if (error?.response?.status !== 409 || detail?.code !== 'FAMILY_SHARING_ACK_REQUIRED' || !Number.isSafeInteger(Number(detail.agencyId)) || Number(detail.agencyId) <= 0) return false;
  window.dispatchEvent(new CustomEvent(FAMILY_SHARING_REQUIRED_EVENT, { detail: { agencyId: Number(detail.agencyId), version: String(detail.version || '') } }));
  return true;
}
