import { google } from '../../utils/googleApis.js';
import { buildImpersonatedJwtClient } from '../googleWorkspaceAuth.service.js';
import { fail } from './policy.js';

export async function createGoogleSession(organizer, { privateAccess = false, guestAccess = false } = {}) {
  try {
    const auth = await buildImpersonatedJwtClient({ subjectEmail: organizer,
      scopes: ['https://www.googleapis.com/auth/meetings.space.created'] });
    const accessType = privateAccess && !guestAccess ? 'RESTRICTED' : 'OPEN';
    const { data } = await google.meet({ version: 'v2', auth }).spaces.create({ requestBody: { config: {
      accessType, entryPointAccess: 'ALL', moderation: privateAccess ? 'ON' : 'OFF',
      artifactConfig: { recordingConfig: { autoRecordingGeneration: 'OFF' },
        transcriptionConfig: { autoTranscriptionGeneration: 'OFF' }, smartNotesConfig: { autoSmartNotesGeneration: 'OFF' } },
    } } }, { timeout: 20000 });
    if (!/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(data.meetingUri || '')) throw new Error('Invalid meeting response');
    if (privateAccess && data.config?.accessType !== accessType) throw new Error('Meeting access was not confirmed');
    return { spaceName: data.name, url: data.meetingUri, organizer };
  } catch {
    // Do not expose Google's request/config object, credentials, or meeting URLs in logs.
    throw fail(503, 'Google Meet could not prepare this appointment. Please try again or contact support.');
  }
}
export async function readGoogleSession({ organizer, meetingCode }) {
  const auth = await buildImpersonatedJwtClient({
    subjectEmail: organizer, scopes: ['https://www.googleapis.com/auth/meetings.space.created']
  });
  const { data } = await google.meet({ version: 'v2', auth }).spaces.get({ name: `spaces/${meetingCode}` }, { timeout: 10000 });
  return data;
}
export async function allowGoogleSessionGuests({ organizer, meetingCode, expectedLink }) {
  try {
    const existing = await readGoogleSession({ organizer, meetingCode });
    if (existing.meetingUri !== expectedLink || !/^spaces\/[a-zA-Z0-9_-]+$/.test(existing.name || '')) throw new Error('Meeting identity changed');
    if (existing.config?.accessType === 'OPEN') return;
    const auth = await buildImpersonatedJwtClient({
      subjectEmail: organizer, scopes: ['https://www.googleapis.com/auth/meetings.space.created']
    });
    const { data } = await google.meet({ version: 'v2', auth }).spaces.patch({ name: existing.name,
      updateMask: 'config.accessType', requestBody: { config: { accessType: 'OPEN' } } }, { timeout: 10000 });
    if (data.config?.accessType !== 'OPEN') throw new Error('Guest entry was not confirmed');
  } catch {
    throw fail(503, 'Guest access could not be enabled. Check the Google Meet host controls.');
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
function notifyreNumberRows(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.smsNumbers ?? payload?.SmsNumbers ?? payload?.Numbers ?? payload?.numbers ?? payload?.VirtualNumbers;
  if (!Array.isArray(rows)) throw fail(503, 'Notifyre returned an unrecognized number list. Contact support before enabling texts.');
  return rows;
}

function notifyrePhone(row) {
  const value = typeof row === 'string' ? row : row?.e164 ?? row?.E164 ?? row?.assignedNumber ?? row?.AssignedNumber ?? row?.Number ?? row?.PhoneNumber ?? row?.number ?? row?.phoneNumber;
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  return /^\d{11,15}$/.test(digits) ? `+${digits}` : null;
}

function notifyreStatus(row) {
  return String(row?.status ?? row?.Status ?? '').trim().toLowerCase();
}

export function notifyreNumbers(payload) {
  return notifyreNumberRows(payload)
    .filter(row => !notifyreStatus(row) || notifyreStatus(row) === 'active')
    .map(notifyrePhone).filter(Boolean);
}

export function assertNotifyreVerificationSender({ numbers, campaigns, from, campaignId }) {
  const campaignRows = Array.isArray(campaigns) ? campaigns : campaigns?.campaigns ?? campaigns?.Campaigns;
  if (!Array.isArray(campaignRows)) throw fail(503, 'Notifyre returned an unrecognized campaign list.');
  const campaignIds = campaign => [campaign.id, campaign.Id, campaign.campaignID, campaign.campaignId, campaign.CampaignID, campaign.CampaignId].filter(Boolean).map(String);
  const campaign = campaignRows.find(row => row && campaignIds(row).includes(String(campaignId)));
  if (!campaign || notifyreStatus(campaign) !== 'active' || String(campaign.useCase ?? campaign.UseCase ?? '').trim().toUpperCase() !== '2FA') {
    throw fail(409, 'Notifyre must report the selected verification campaign as active for 2FA.');
  }

  const linkedIds = campaignIds(campaign);
  const matching = notifyreNumberRows(numbers).some(row =>
    notifyrePhone(row) === from && notifyreStatus(row) === 'active'
    && linkedIds.includes(String(row?.campaignID ?? row?.campaignId ?? row?.CampaignID ?? row?.CampaignId))
  );
  if (!matching) {
    throw fail(409, 'Notifyre has not activated this number on the selected 2FA campaign. Check the number status in Notifyre.');
  }
}

export function notifyreReceipt(payload) {
  const invalid = payload?.invalidToNumbers ?? payload?.InvalidToNumbers ?? [];
  const id = payload?.smsMessageID || payload?.SmsMessageID || payload?.ID || payload?.MessageID || payload?.id || payload?.SmsID;
  if (!id || !Array.isArray(invalid) || invalid.length)
    throw fail(503, 'The SMS receipt is uncertain. Review carrier activity before retrying.');
  return String(id);
}
