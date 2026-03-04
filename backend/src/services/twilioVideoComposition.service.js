/**
 * Twilio Video Compositions: create composition from room recordings, download, store.
 * Used when a team meeting or huddle room ends - creates a playable MP4 and stores in GCS.
 */

import TwilioService from './twilio.service.js';
import StorageService from './storage.service.js';

function getVideoConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  return { accountSid, authToken };
}

/**
 * Create a composition from room recordings (mosaic layout, all participants).
 * @param {string} roomSid - Room SID
 * @returns {Promise<{ compositionSid: string } | null>}
 */
async function createComposition(roomSid) {
  const cfg = getVideoConfig();
  if (!cfg) return null;

  const url = 'https://video.twilio.com/v1/Compositions';
  const body = new URLSearchParams({
    RoomSid: roomSid,
    VideoLayout: JSON.stringify({ grid: {} }),
    Format: 'mp4',
    Trim: 'true',
    Resolution: '1280x720'
  }).toString();

  try {
    const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`
      },
      body
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error('[TwilioComposition] create failed:', resp.status, errText?.slice(0, 300));
      return null;
    }
    const data = await resp.json();
    return { compositionSid: data?.sid };
  } catch (e) {
    console.error('[TwilioComposition] create error:', e?.message);
    return null;
  }
}

/**
 * Get composition status.
 * @param {string} compositionSid
 * @returns {Promise<{ status: string } | null>}
 */
async function getCompositionStatus(compositionSid) {
  const cfg = getVideoConfig();
  if (!cfg) return null;

  const url = `https://video.twilio.com/v1/Compositions/${compositionSid}`;
  try {
    const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
    const resp = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` }
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return { status: data?.status || '' };
  } catch (e) {
    console.error('[TwilioComposition] get status error:', e?.message);
    return null;
  }
}

/**
 * Download composition media (follows redirect).
 * @param {string} compositionSid
 * @returns {Promise<Buffer | null>}
 */
async function downloadCompositionMedia(compositionSid) {
  const cfg = getVideoConfig();
  if (!cfg) return null;

  const url = `https://video.twilio.com/v1/Compositions/${compositionSid}/Media`;
  try {
    const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
    const resp = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` }
    });
    if (!resp.ok) {
      console.error('[TwilioComposition] media fetch failed:', resp.status);
      return null;
    }
    const json = await resp.json();
    const redirectTo = json?.redirect_to;
    if (!redirectTo) {
      console.error('[TwilioComposition] No redirect_to in media response');
      return null;
    }
    const mediaResp = await fetch(redirectTo);
    if (!mediaResp.ok) {
      console.error('[TwilioComposition] media download failed:', mediaResp.status);
      return null;
    }
    const arrayBuffer = await mediaResp.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    console.error('[TwilioComposition] download error:', e?.message);
    return null;
  }
}

/**
 * Poll for composition completion (max ~5 min).
 * @param {string} compositionSid
 * @param {number} maxWaitMs
 * @returns {Promise<boolean>} true if completed
 */
async function waitForComposition(compositionSid, maxWaitMs = 300000) {
  const start = Date.now();
  const pollInterval = 5000;

  while (Date.now() - start < maxWaitMs) {
    const info = await getCompositionStatus(compositionSid);
    if (!info) return false;
    const status = String(info.status || '').toLowerCase();
    if (status === 'completed') return true;
    if (status === 'failed' || status === 'deleted') {
      console.warn('[TwilioComposition] Composition', compositionSid, 'ended with status:', status);
      return false;
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  console.warn('[TwilioComposition] Timeout waiting for composition', compositionSid);
  return false;
}

/**
 * Create composition, wait for completion, download, and store for a team meeting.
 * @param {{ roomSid: string, eventId: number }} opts
 * @returns {Promise<{ recordingPath: string, recordingUrl: string } | null>}
 */
export async function createDownloadAndStoreMeetingRecording({ roomSid, eventId }) {
  const eid = Number(eventId || 0);
  if (!eid || !roomSid) return null;

  const created = await createComposition(roomSid);
  if (!created?.compositionSid) return null;

  const completed = await waitForComposition(created.compositionSid);
  if (!completed) return null;

  const buffer = await downloadCompositionMedia(created.compositionSid);
  if (!buffer || buffer.length === 0) return null;

  const filename = `meeting-${eid}-${Date.now()}.mp4`;
  const result = await StorageService.saveMeetingRecording({
    eventId: eid,
    fileBuffer: buffer,
    filename,
    contentType: 'video/mp4'
  });

  if (!result?.relativePath) return null;

  const recordingPath = result.relativePath;
  const recordingUrl = `/uploads/${recordingPath.startsWith('uploads/') ? recordingPath.substring('uploads/'.length) : recordingPath}`;

  return { recordingPath, recordingUrl };
}
