import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';

export async function resolveInterviewSender(agencyId) {
  const identities = await EmailSenderIdentity.list({ agencyId: Number(agencyId), includePlatformDefaults: false, onlyActive: true });
  const identity = identities.find(row => Number(row.agency_id) === Number(agencyId)
    && row.is_active !== false && row.is_active !== 0
    && /^po@[^\s@]+\.[^\s@]+$/i.test(String(row.from_email || '').trim()));
  if (!identity) throw Object.assign(new Error('Configure an active po@tenant-domain sender in Email Settings before sending interview invitations.'), { status: 409 });
  return identity;
}

export function interviewDeliveryStatus(result) {
  if (result?.skipped || !result?.id || result?.queued) return { sent: false, reason: result?.reason || 'Email delivery was not confirmed.' };
  return { sent: true, redirected: !!result.redirected };
}
