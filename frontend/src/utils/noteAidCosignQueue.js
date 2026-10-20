/** Shared presentation for the workspace queue and the Tasks Notes to co-sign tab. */
export function normalizeCosignQueueItems(notes) {
  return (Array.isArray(notes) ? notes : []).map((n) => ({
    id: `cosign_${n.id || n.clinical_note_id}`,
    signoffId: n.id,
    clinicalNoteId: n.clinical_note_id || n.clinicalNoteId,
    agencyId: n.agency_id || n.agencyId || null,
    clientId: n.client_id || n.clientId || null,
    clientName: n.client_name || n.clientName
      || [n.client_first_name, n.client_last_name].filter(Boolean).join(' ').trim() || null,
    providerName: [n.provider_first_name, n.provider_last_name].filter(Boolean).join(' ').trim()
      || n.provider_name || 'Provider',
    serviceCode: n.service_code || n.serviceCode || null,
    date: String(n.date_of_service || n.dateOfService || n.provider_signed_at || n.created_at || '').slice(0, 10),
    signedAt: n.provider_signed_at || n.created_at || null
  }));
}
