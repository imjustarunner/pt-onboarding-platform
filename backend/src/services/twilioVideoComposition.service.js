/**
 * Twilio Video Compositions: create composition from room recordings, download, store.
 * Used when a team meeting or huddle room ends - creates a playable MP4 and stores in GCS.
 *
 * Composition status callback: when TWILIO_VIDEO_WEBHOOK_URL is set, compositions are created
 * with statusCallback so Twilio POSTs to /composition-status when done. This replaces polling.
 */

import pool from '../config/database.js';
import TwilioService from './twilio.service.js';
import StorageService from './storage.service.js';

function getVideoConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const webhookUrl = (process.env.TWILIO_VIDEO_WEBHOOK_URL || '').trim();
  if (!accountSid || !authToken) return null;
  const statusCallback = webhookUrl ? webhookUrl.replace(/\/webhook\/?$/i, '') + '/composition-status' : null;
  return { accountSid, authToken, statusCallback };
}

/**
 * Create a composition from room recordings (mosaic layout, all participants).
 * When statusCallback is configured, Twilio will POST when done instead of polling.
 * @param {string} roomSid - Room SID
 * @param {Object} [opts]
 * @param {number} [opts.eventId] - For status callback: store mapping so webhook can process
 * @returns {Promise<{ compositionSid: string } | null>}
 */
async function createComposition(roomSid, opts = {}) {
  const cfg = getVideoConfig();
  if (!cfg) return null;

  const params = {
    RoomSid: roomSid,
    VideoLayout: JSON.stringify({ grid: {} }),
    Format: 'mp4',
    Trim: 'true',
    Resolution: '1280x720'
  };
  if (cfg.statusCallback) {
    params.StatusCallback = cfg.statusCallback;
  }

  const url = 'https://video.twilio.com/v1/Compositions';
  const body = new URLSearchParams(params).toString();

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
    const compositionSid = data?.sid;

    if (compositionSid && opts.eventId && cfg.statusCallback) {
      try {
        await pool.execute(
          `INSERT INTO twilio_composition_pending (composition_sid, event_id, room_sid, status)
           VALUES (?, ?, ?, 'processing')`,
          [compositionSid, Number(opts.eventId), roomSid]
        );
      } catch (dbErr) {
        console.warn('[TwilioComposition] Failed to store pending mapping:', dbErr?.message);
      }
    }

    return { compositionSid };
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
 * Create composition, wait for completion (or use callback), download, and store for a team meeting.
 * When TWILIO_VIDEO_WEBHOOK_URL is set, composition uses statusCallback and returns null immediately;
 * the webhook will download and store when Twilio POSTs status=completed.
 * @param {{ roomSid: string, eventId: number }} opts
 * @returns {Promise<{ recordingPath: string, recordingUrl: string } | null>}
 */
export async function createDownloadAndStoreMeetingRecording({ roomSid, eventId }) {
  const eid = Number(eventId || 0);
  if (!eid || !roomSid) return null;

  const cfg = getVideoConfig();
  const useCallback = !!(cfg?.statusCallback);

  const created = await createComposition(roomSid, useCallback ? { eventId: eid } : {});
  if (!created?.compositionSid) return null;

  if (useCallback) {
    return null;
  }

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

/**
 * Process composition status callback: when status=completed, download, store in GCS, update artifact.
 * Called from the composition-status webhook handler.
 * @param {string} compositionSid
 * @returns {Promise<boolean>} true if processed successfully
 */
export async function processCompositionCompleted(compositionSid) {
  const sid = String(compositionSid || '').trim();
  if (!sid) return false;

  let row = null;
  try {
    const [rows] = await pool.execute(
      `SELECT event_id, room_sid FROM twilio_composition_pending WHERE composition_sid = ? AND status = 'processing' LIMIT 1`,
      [sid]
    );
    row = rows?.[0] || null;
  } catch (e) {
    console.error('[TwilioComposition] Lookup pending error:', e?.message);
    return false;
  }

  if (!row) {
    return false;
  }

  const eid = Number(row.event_id || 0);
  if (!eid) return false;

  try {
    await pool.execute(
      `UPDATE twilio_composition_pending SET status = 'completed' WHERE composition_sid = ?`,
      [sid]
    );
  } catch {
    // ignore
  }

  const buffer = await downloadCompositionMedia(sid);
  if (!buffer || buffer.length === 0) {
    console.warn('[TwilioComposition] No media for', sid);
    return false;
  }

  const filename = `meeting-${eid}-${Date.now()}.mp4`;
  const result = await StorageService.saveMeetingRecording({
    eventId: eid,
    fileBuffer: buffer,
    filename,
    contentType: 'video/mp4'
  });

  if (!result?.relativePath) return false;

  const recordingPath = result.relativePath;
  const recordingUrl = `/uploads/${recordingPath.startsWith('uploads/') ? recordingPath.substring('uploads/'.length) : recordingPath}`;

  const ProviderScheduleEventArtifact = (await import('../models/ProviderScheduleEventArtifact.model.js')).default;
  await ProviderScheduleEventArtifact.ensureTagged({ eventId: eid });
  await ProviderScheduleEventArtifact.upsertByEventId({
    eventId: eid,
    recordingPath,
    recordingUrl,
    updatedByUserId: null
  });

  try {
    await pool.execute(`DELETE FROM twilio_composition_pending WHERE composition_sid = ?`, [sid]);
  } catch {
    // ignore
  }

  return true;
}
