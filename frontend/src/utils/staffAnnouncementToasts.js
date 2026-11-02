export async function loadStaffAnnouncementToasts({ request, userId, currentAgencyId, agencies = [] }) {
  const selected = Number(currentAgencyId || 0);
  const ids = selected ? [selected] : [...new Set(agencies
    .filter(agency => !agency.organization_type || agency.organization_type === 'agency')
    .map(agency => Number(agency.id)).filter(id => Number.isSafeInteger(id) && id > 0))];
  const results = await Promise.allSettled(ids.map(async id => {
    const response = await request(`/agencies/${id}/announcements/toasts`, { skipGlobalLoading: true });
    return (Array.isArray(response.data) ? response.data : []).map(item => ({ ...item, agency_id: id }));
  }));
  if (results.length && results.every(result => result.status === 'rejected')) throw results[0].reason;
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : []).filter(item => {
    if (selected) return true;
    let recipients = item.recipient_user_ids;
    if (typeof recipients === 'string') { try { recipients = JSON.parse(recipients); } catch { recipients = []; } }
    return Array.isArray(recipients) && recipients.some(id => Number(id) === Number(userId));
  });
}
