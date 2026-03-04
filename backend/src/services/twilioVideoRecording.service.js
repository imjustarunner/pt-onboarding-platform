/**
 * Twilio Video recording pipeline: fetch recordings, download audio, transcribe.
 * Used when a supervision room ends (room-ended webhook).
 *
 * Requires: ffmpeg (for mka→wav conversion; Twilio Video recordings are mka/opus,
 * Google Speech-to-Text does not support mka directly).
 */

import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync, writeFileSync, readFileSync } from 'fs';
import TwilioService from './twilio.service.js';
import { transcribeLongAudio } from './speechTranscription.service.js';

/**
 * Download Twilio Video recording media (mka format).
 * GET /v1/Recordings/{sid}/Media returns { redirect_to: url }; follow redirect for binary.
 */
async function downloadVideoRecordingMedia(recordingSid) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error('Twilio not configured');
  }
  const url = `https://video.twilio.com/v1/Recordings/${recordingSid}/Media`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const resp = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` }
  });
  if (!resp.ok) {
    throw new Error(`Twilio Video recording media fetch failed (${resp.status})`);
  }
  const json = await resp.json();
  const redirectTo = json?.redirect_to;
  if (!redirectTo) {
    throw new Error('No redirect_to in Twilio Video recording media response');
  }
  const mediaResp = await fetch(redirectTo);
  if (!mediaResp.ok) {
    throw new Error(`Twilio Video recording download failed (${mediaResp.status})`);
  }
  const arrayBuffer = await mediaResp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Fetch recordings for a room, download audio tracks, transcribe, and return combined transcript.
 * @param {{ roomSid: string, roomName?: string, sessionId: number, userId?: number }} opts
 * @returns {Promise<string>} Combined transcript text or empty string
 */
export async function transcribeRoomRecordings({ roomSid, roomName, sessionId, userId }) {
  try {
    const client = TwilioService.getClient();
    const sid = Number(sessionId || 0);
    if (!sid) return '';

    let recordings = [];
    try {
      recordings = await client.video.v1.rooms(roomSid).recordings.list({ limit: 50 });
    } catch (e) {
      console.error('[TwilioVideoRecording] list recordings error:', e?.message);
      return '';
    }

  const audioRecordings = (recordings || []).filter(
    (r) => String(r?.type || '').toLowerCase() === 'audio' && String(r?.status || '') === 'completed'
  );
  if (audioRecordings.length === 0) {
    return '';
  }

  const transcripts = [];
  for (const rec of audioRecordings) {
    const recSid = rec?.sid;
    if (!recSid) continue;
    try {
      const mkaBuffer = await downloadVideoRecordingMedia(recSid);
      if (!mkaBuffer || mkaBuffer.length === 0) continue;

      let wavBuffer;
      try {
        const tmpDir = tmpdir();
        const inPath = join(tmpDir, `twilio-rec-${Date.now()}-${Math.random().toString(36).slice(2)}.mka`);
        const outPath = join(tmpDir, `twilio-rec-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
        writeFileSync(inPath, mkaBuffer);
        try {
          execSync(`ffmpeg -y -i "${inPath}" -acodec pcm_s16le -ar 16000 -ac 1 "${outPath}"`, {
            stdio: 'pipe',
            timeout: 60000
          });
          wavBuffer = readFileSync(outPath);
        } finally {
          try {
            if (existsSync(inPath)) unlinkSync(inPath);
            if (existsSync(outPath)) unlinkSync(outPath);
          } catch {
            // ignore
          }
        }
      } catch (ffErr) {
        console.warn('[TwilioVideoRecording] ffmpeg conversion failed, skipping:', ffErr?.message);
        continue;
      }

      const transcript = await transcribeLongAudio({
        buffer: wavBuffer,
        mimeType: 'audio/wav',
        languageCode: 'en-US',
        userId: userId || 0
      });
      if (transcript && String(transcript).trim()) {
        transcripts.push(String(transcript).trim());
      }
    } catch (e) {
      console.error('[TwilioVideoRecording] transcribe recording error:', e?.message);
    }
  }

  return transcripts.join('\n\n').trim();
  } catch (e) {
    console.error('[TwilioVideoRecording] transcribeRoomRecordings error:', e?.message);
    return '';
  }
}
