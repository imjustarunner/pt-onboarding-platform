export async function deliverCompanyEventVoteReply({ result, from, to, send }) {
  if (!result?.handled || !result.responseMessage || !result.agencyId) return false;
  await send({ purpose: 'polling', agencyId: result.agencyId, from: to, to: from, body: result.responseMessage });
  return true;
}
