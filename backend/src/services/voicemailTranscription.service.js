/**
 * Voicemail transcription — voice provider not configured.
 * When a voice provider is wired up, implement recording download here.
 */

export async function transcribeVoicemail({ voicemailId, recordingSid, userId }) {
  console.log(`[VoicemailTranscription] Skipped (voice not configured) — voicemailId=${voicemailId}, recordingSid=${recordingSid}`);
  return null;
}
