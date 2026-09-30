/** Finish only an existing, imported client. Retrying must never create another chart. */
export async function finishClientCreation({ api, clientId, agencyId, organizationId, outcome, providerId, serviceDay, isSchool, schedule }) {
  if (!clientId) throw new Error('Save the client before completing setup');
  if (schedule && (schedule.days?.length || schedule.periods?.length || schedule.windows?.length || schedule.notes)) {
    await api.put(`/client-exchange/clients/${clientId}/schedule`, { agencyId: Number(agencyId), schedule });
  }
  if (outcome === 'assign') {
    if (!providerId) throw new Error('Select a provider for Assign and save');
    const existing = (await api.get(`/clients/${clientId}`)).data;
    if (Number(existing?.provider_id) === Number(providerId)) return null;
    if (isSchool) {
      await api.post(`/clients/${clientId}/provider-assignments`, {
        organization_id: Number(organizationId), provider_user_id: Number(providerId),
        service_day: serviceDay || 'Unknown', is_primary: true
      });
    } else {
      await api.put(`/clients/${clientId}/provider`, { provider_id: Number(providerId) });
    }
    const { data } = await api.get(`/clients/${clientId}`);
    if (Number(data?.provider_id) !== Number(providerId)) throw new Error('Provider assignment was not confirmed. Retry assignment for this saved client.');
  } else if (outcome === 'exchange') {
    const { data } = await api.post('/client-exchange/listings', { agencyId: Number(agencyId), clientId: Number(clientId), quickPost: true });
    return data.listing;
  } else if (outcome !== 'unassigned') {
    throw new Error('Choose how to save the client');
  }
  return null;
}
