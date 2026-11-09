export async function deliverCompanyEventVoteReply({ result, from, to, send }) {
  if (!result?.handled || !result.responseMessage || !result.agencyId) return false;
  await send({ purpose: result.purpose || 'polling', agencyId: result.agencyId, from: to, to: from, body: result.responseMessage, companyEventReply: true,
    ...(result.eventId ? { companyEventId: result.eventId } : {}) });
  return true;
}
