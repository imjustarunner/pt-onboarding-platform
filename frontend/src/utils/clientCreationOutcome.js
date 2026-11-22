/** Finish only an existing, imported client. Retrying must never create another chart. */
export async function finishClientCreation({ api, clientId, agencyId, organizationId, outcome, providerId, serviceKind, serviceDay, isSchool, schedule, matchingPreferences, clientAlert }) {
  if (!clientId) throw new Error('Save the client before completing setup');
  if (schedule && (schedule.days?.length || schedule.periods?.length || schedule.windows?.length || schedule.notes)) {
    await api.put(`/client-exchange/clients/${clientId}/schedule`, { agencyId: Number(agencyId), schedule });
  }
  if (matchingPreferences && Object.values(matchingPreferences).some(list=>list?.length)) {
    await api.put(`/client-exchange/clients/${clientId}/matching-preferences`, {agencyId:Number(agencyId),matchingPreferences});
  }
  if (outcome === 'assign') {
    if (!providerId) throw new Error('Select a provider for Assign and save');
    if (serviceKind === 'tutoring') {
      const resource = `/clients/${clientId}/service-enrollments`;
      const selectedOrg = Number(organizationId) === Number(agencyId) ? 0 : Number(organizationId) || 0;
      const { data } = await api.get(resource, {params:{agencyId:Number(agencyId)}});
      const active = (data.services || []).filter(row => row.service_kind === serviceKind && Number(row.is_active) === 1
        && Number(row.organization_id || 0) === selectedOrg);
      if (active.some(row => Number(row.provider_user_id) === Number(providerId))) return null;
      const vacant = active.find(row => !Number(row.provider_user_id) && /^(tutoring|learning)$/i.test(row.label));
      const response = await api.post(resource, {
        agencyId:Number(agencyId), serviceKind, providerUserId:Number(providerId),
        organizationId:selectedOrg, label:vacant?.label || 'Tutoring', ...(vacant ? {serviceId:vacant.id} : {})
      });
      if (!response.data?.services?.some(row => row.service_kind === serviceKind && Number(row.is_active) === 1 && Number(row.organization_id || 0) === selectedOrg && Number(row.provider_user_id) === Number(providerId))) {
        throw new Error('The Learning assignment could not be confirmed. Reopen Assignments to review the saved client.');
      }
      return null;
    }
    const existing = (await api.get(`/clients/${clientId}`)).data;
    if (Number(existing?.provider_id) === Number(providerId)) return null;
    const alert = String(clientAlert || '').trim();
    if (isSchool) {
      await api.post(`/clients/${clientId}/provider-assignments`, {
        organization_id: Number(organizationId), provider_user_id: Number(providerId),
        service_day: serviceDay || 'Unknown', is_primary: true,
        ...(alert ? { client_alert: alert } : {})
      });
    } else {
      await api.put(`/clients/${clientId}/provider`, {
        provider_id: Number(providerId),
        ...(alert ? { client_alert: alert } : {})
      });
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
