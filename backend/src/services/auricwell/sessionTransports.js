import { google } from 'googleapis';
import { buildImpersonatedJwtClient } from '../googleWorkspaceAuth.service.js';
import { fail } from './policy.js';

export async function createGoogleSession(organizer) {
  try {
    const auth = await buildImpersonatedJwtClient({ subjectEmail: organizer,
      scopes: ['https://www.googleapis.com/auth/meetings.space.created'] });
    const { data } = await google.meet({ version: 'v2', auth }).spaces.create({ requestBody: { config: {
      accessType: 'OPEN', entryPointAccess: 'ALL', moderation: 'OFF',
      artifactConfig: { recordingConfig: { autoRecordingGeneration: 'OFF' },
        transcriptionConfig: { autoTranscriptionGeneration: 'OFF' }, smartNotesConfig: { autoSmartNotesGeneration: 'OFF' } },
    } } }, { timeout: 20000 });
    if (!/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(data.meetingUri || '')) throw new Error('Invalid meeting response');
    return { spaceName: data.name, url: data.meetingUri, organizer };
  } catch {
    // Do not expose Google's request/config object, credentials, or meeting URLs in logs.
    throw fail(503, 'Google Meet could not prepare this appointment. Please try again or contact support.');
  }
}
export async function retireGoogleSession(room) {
  try {
    const auth = await buildImpersonatedJwtClient({ subjectEmail: room.organizer,
      scopes: ['https://www.googleapis.com/auth/meetings.space.created'] });
    const spaces = google.meet({ version: 'v2', auth }).spaces;
    // These spaces have no Calendar invitees. Restricting admission removes
    // anonymous self-entry; ending the conference disconnects current guests.
    await spaces.patch({ name: room.spaceName, updateMask: 'config.accessType',
      requestBody: { config: { accessType: 'RESTRICTED' } } }, { timeout: 20000 });
    const { data } = await spaces.get({ name: room.spaceName }, { timeout: 20000 });
    if (data.activeConference) await spaces.endActiveConference({ name: room.spaceName, requestBody: {} }, { timeout: 20000 });
  } catch { throw fail(503, 'The previous Google Meet room could not be closed. Please try again or contact support.'); }
}
export async function notifyreRequest(token, path, body, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(`https://api.notifyre.com${path}`, {
      method: body ? 'POST' : 'GET', headers: { 'x-api-token': token, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000), redirect: 'error',
    });
    const result = await response.json();
    if (!response.ok || (result?.success ?? result?.Success) !== true) throw new Error('Rejected');
    return result.payload ?? result.Payload;
  } catch { throw fail(503, 'Notifyre did not confirm the request. Check the account activity before retrying a send.'); }
}
export function notifyreNumbers(payload) {
  const values = Array.isArray(payload) ? payload : payload?.smsNumbers ?? payload?.SmsNumbers ?? payload?.Numbers ?? payload?.numbers ?? payload?.VirtualNumbers;
  if (!Array.isArray(values)) throw fail(503, 'Notifyre returned an unrecognized number list. Contact support before enabling texts.');
  return values.map(n => typeof n === 'string' ? n : n.Number || n.PhoneNumber || n.number || n.phoneNumber).filter(Boolean)
    .map(n => `+${String(n).replace(/\D/g, '')}`);
}

export function notifyreReceipt(payload) {
  const invalid = payload?.invalidToNumbers ?? payload?.InvalidToNumbers ?? [];
  const id = payload?.smsMessageID || payload?.SmsMessageID || payload?.ID || payload?.MessageID || payload?.id || payload?.SmsID;
  if (!id || !Array.isArray(invalid) || invalid.length)
    throw fail(503, 'The SMS receipt is uncertain. Review carrier activity before retrying.');
  return String(id);
}
