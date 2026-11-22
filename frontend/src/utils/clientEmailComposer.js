import {openEmailComposer} from './emailComposerWindow';
export function isClientRecipient(person) {
  return Number(person?.clientId) > 0 && person?.personKey === `client:${person.clientId}@${person.agencyId}`;
}
export async function resolveClientEmail(api,clientId,agencyId) {
  const key = `client:${clientId}@${agencyId}`;
  const {data} = await api.get(`/messages/hub/people/${encodeURIComponent(key)}`, {params:{agencyId},headers:{'X-Agency-Id':String(agencyId)},skipGlobalLoading:true});
  const person = data?.person;
  if (!isClientRecipient(person) || person.personKey !== key) throw new Error('This client is unavailable for messaging in this agency.');
  if (!person.email) throw new Error('Add the client’s own email in Demographics to send email.');
  return person;
}
export function composeClientEmail(router,person) {
  openEmailComposer(router,{mode:'new',agencyId:person.agencyId,clientId:person.clientId,to:person.email});
}
