/** Link parameters select a review, never authorize or apply a cancellation. */
export function dayCancellationLinkContext(query, userId) {
  if (!query?.cancelDay) return null;
  const date = String(query.cancelDay), providerId = Number(query.providerId), agencyId = Number(query.agencyId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date
    || !Number.isSafeInteger(providerId) || providerId < 1 || !Number.isSafeInteger(agencyId) || agencyId < 1) return { error: 'This cancellation link is incomplete. Open Cancel day from your schedule.' };
  const actorId = typeof userId === 'object' ? userId?.id : userId;
  const manager = typeof userId === 'object' && ['super_admin','superadmin','admin','support','staff','scheduler','front_desk'].includes(String(userId?.role || '').toLowerCase());
  if (Number(actorId) !== providerId && !manager) return { error: 'This link is for another provider. Sign in with the provider account that received it.' };
  return { date, providerId, agencyId };
}
