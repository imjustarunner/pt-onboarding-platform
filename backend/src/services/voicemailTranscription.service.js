/**
 * Voicemail transcription via Google Speech-to-Text.
 * Called asynchronously after a voicemail is recorded (fire-and-forget from webhook).
 */
import TwilioService from './twilio.service.js';
import { transcribeLongAudio } from './speechTranscription.service.js';
import CallVoicemail from '../models/CallVoicemail.model.js';

/**
 * Download Twilio recording, transcribe with Google Speech-to-Text, update voicemail.
 * @param {{ voicemailId: number, recordingSid: string, userId?: number }} params
 */
export async function transcribeVoicemail({ voicemailId, recordingSid, userId }) {
  if (!voicemailId || !recordingSid) {
    throw new Error('voicemailId and recordingSid are required');
  }

  const buffer = await TwilioService.downloadRecordingMedia({
    recordingSid,
    format: 'mp3'
  });

  const transcript = await transcribeLongAudio({
    buffer,
    mimeType: 'audio/mpeg',
    languageCode: 'en-US',
    userId
  });

  await CallVoicemail.updateTranscription(voicemailId, transcript || null);
  return transcript;
}
