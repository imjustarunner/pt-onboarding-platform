import ClientGuardian from '../models/ClientGuardian.model.js';

export async function recordClientDemographics(client) {
  if (!client.demographics_phi_enc) return {};
  const { decryptDemographicsPayload } = await import('./demographicsImport.service.js');
  const value = decryptDemographicsPayload(client.demographics_phi_enc);
  if (!value) throw Object.assign(new Error('Client demographics could not be read. No incomplete record was exported.'), { status: 422 });
  return value;
}
export async function recordClientGuardians(clientId) {
  return (await ClientGuardian.listForClient(clientId))
    .filter(row => row.relationship_type !== 'self' && Number(row.access_enabled) === 1)
    .map(row => ({ name: [row.first_name, row.last_name].filter(Boolean).join(' '), relationship: row.relationship_title || row.relationship_type, phone: row.phone, email: row.email }));
}
