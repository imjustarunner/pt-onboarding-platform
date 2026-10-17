import { sendEnrollmentPortalEmail } from './enrollmentPortalEmail.service.js';

/** Receipt mail belongs to the caring tenant, never an arbitrary school member's inbox. */
export async function sendPacketCompletionNotification({ agencyId, organizationId, scopeType, source = 'auto', ...message }) {
  const tenantId = Number(agencyId || (String(scopeType || '').toLowerCase() !== 'school' ? organizationId : 0));
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
    throw Object.assign(new Error('A tenant is required to send the packet confirmation.'), { code: 'INTAKE_NOTIFICATION_TENANT_REQUIRED' });
  }
  return sendEnrollmentPortalEmail({
    ...message,
    agencyId: tenantId,
    schoolOrganizationId: String(scopeType || '').toLowerCase() === 'school' ? organizationId : null,
    source,
    templateType: message.templateType || 'intake_packet_completion'
  });
}
