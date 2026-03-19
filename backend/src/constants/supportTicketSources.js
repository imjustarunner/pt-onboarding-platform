export const SUPPORT_TICKET_SOURCE_KEYS = Object.freeze({
  FORGOT_USERNAME: 'forgot_username',
  INFO_REQUEST: 'info_request',
  MAILING_LIST: 'mailing_list',
  EXTERNAL_REQUEST: 'external_request'
});

export function normalizeSupportTicketSourceKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return SUPPORT_TICKET_SOURCE_KEYS.EXTERNAL_REQUEST;
  return key;
}

export function supportTicketSourceLabel(value) {
  const key = normalizeSupportTicketSourceKey(value);
  const labels = {
    [SUPPORT_TICKET_SOURCE_KEYS.FORGOT_USERNAME]: 'Forgot Username',
    [SUPPORT_TICKET_SOURCE_KEYS.INFO_REQUEST]: 'Info Request',
    [SUPPORT_TICKET_SOURCE_KEYS.MAILING_LIST]: 'Mailing List',
    [SUPPORT_TICKET_SOURCE_KEYS.EXTERNAL_REQUEST]: 'External Request'
  };
  return labels[key] || key;
}
