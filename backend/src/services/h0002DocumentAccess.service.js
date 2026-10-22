// Request-local capability created only after screeningReviewContext verifies
// the signed-in reviewer, task, client, note author and agency. HTTP parameters
// cannot manufacture it. Only the existing read controllers consult it.
const grants = new WeakMap();
export function grantScreeningDocumentRead(req, { session, source }) {
  if (Number(req.user?.id) !== Number(session.provider_user_id)
    || Number(source.client.id) !== Number(session.client_id)
    || Number(source.task.assigned_to_user_id) !== Number(req.user.id)
    || Number(source.task.assigned_to_agency_id) !== Number(session.agency_id)) {
    throw Object.assign(new Error('Screening document assignment does not match.'), { status: 403 });
  }
  grants.set(req, { userId: Number(req.user.id), clientId: Number(session.client_id), agencyId: Number(session.agency_id) });
}
export function hasScreeningDocumentRead(req, client) {
  const grant = grants.get(req);
  return !!grant && grant.userId === Number(req.user?.id) && grant.clientId === Number(client?.id) && grant.agencyId === Number(client?.agency_id);
}
