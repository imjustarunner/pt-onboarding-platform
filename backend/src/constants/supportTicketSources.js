export const SUPPORT_TICKET_SOURCE_KEYS = Object.freeze({
  FORGOT_USERNAME: 'forgot_username',
  INFO_REQUEST: 'info_request',
  MAILING_LIST: 'mailing_list',
  EXTERNAL_REQUEST: 'external_request',
  PUBLIC_SCHOOL_REFERRAL: 'public_school_referral',
  PUBLIC_SCHOOL_INTAKE_SPLASH: 'public_school_intake_splash',
  GUARDIAN_TEMP_PASSWORD: 'guardian_temp_password',
  GUARDIAN_ACCESS_TOKEN: 'guardian_access_token',
  PUBLIC_AGENCY_SUPPORT: 'public_agency_support',
  PREHIRE_PORTAL_CHAT: 'prehire_portal_chat',
  CLIENT_RENEWAL: 'client_renewal'
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
    [SUPPORT_TICKET_SOURCE_KEYS.EXTERNAL_REQUEST]: 'External Request',
    [SUPPORT_TICKET_SOURCE_KEYS.PUBLIC_SCHOOL_REFERRAL]: 'Public School Referral Finder',
    [SUPPORT_TICKET_SOURCE_KEYS.PUBLIC_SCHOOL_INTAKE_SPLASH]: 'Public School Intake Splash',
    [SUPPORT_TICKET_SOURCE_KEYS.GUARDIAN_TEMP_PASSWORD]: 'Guardian temporary password',
    [SUPPORT_TICKET_SOURCE_KEYS.GUARDIAN_ACCESS_TOKEN]: 'Guardian access token',
    [SUPPORT_TICKET_SOURCE_KEYS.PUBLIC_AGENCY_SUPPORT]: 'Public agency support',
    [SUPPORT_TICKET_SOURCE_KEYS.PREHIRE_PORTAL_CHAT]: 'Pre-hire portal chat',
    [SUPPORT_TICKET_SOURCE_KEYS.CLIENT_RENEWAL]: 'Client renewal hub'
  };
  return labels[key] || key;
}
