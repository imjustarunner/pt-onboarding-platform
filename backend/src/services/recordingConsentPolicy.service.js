import SessionRecordingConsent from '../models/SessionRecordingConsent.model.js';
export async function requireClinicalRecordingConsent(recording) {
  if (recording.session_kind !== 'clinical' && !recording.client_id) return;
  const consent = recording.client_id && await SessionRecordingConsent.findOnFile({ agencyId:recording.agency_id,clientId:recording.client_id });
  if (!consent) throw Object.assign(new Error('A signed audio recording consent for this client must be on file before recording or transcription.'), {status:403});
  return consent;
}
