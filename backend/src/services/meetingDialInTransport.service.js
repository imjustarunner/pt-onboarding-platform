import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Vonage } from '@vonage/server-sdk';
import { readFileSync } from 'node:fs';
import Video from './vonageVideo.service.js';
import { dialInError, dialInReadiness, requireDialInConfiguration } from './meetingDialInPolicy.js';

export function verifyDialInWebhook(raw, authorization, env = process.env) {
  if (!env.VONAGE_VOICE_SIGNATURE_SECRET || !env.VONAGE_API_KEY) throw dialInError('Telephone callbacks are not configured.', 503);
  const token = /^Bearer (\S+)$/i.exec(String(authorization || ''))?.[1];
  let claims;
  try { claims = jwt.verify(token, env.VONAGE_VOICE_SIGNATURE_SECRET, { algorithms: ['HS256'], maxAge: '10m', clockTolerance: 30 }); }
  catch { throw dialInError('Invalid telephone callback signature.', 401); }
  if (!Number.isFinite(claims.iat) || claims.iat > Date.now() / 1000 + 30 || String(claims.api_key) !== String(env.VONAGE_API_KEY)
    || claims.payload_hash !== crypto.createHash('sha256').update(raw).digest('hex')) throw dialInError('Invalid telephone callback payload.', 401);
  try { return JSON.parse(raw.toString('utf8')); } catch { throw dialInError('Invalid telephone callback.', 400); }
}
export const dialInWebhookUrl = path => { requireDialInConfiguration({ allowDisabled: true }); return `${dialInReadiness().origin}/api/meeting-dial-in/voice/${path}`; };
export function pinPrompt(message = 'Enter your ten digit personal meeting PIN, followed by the pound key.') {
  return [{ action: 'talk', text: message }, { action: 'input', type: ['dtmf'], dtmf: { maxDigits: 10, timeOut: 10, submitOnHash: true }, eventUrl: [dialInWebhookUrl('pin')], eventMethod: 'POST' }];
}
export function hostPrompt() {
  return [{ action: 'talk', text: 'You are a meeting host. Press one to admit invited telephone participants automatically while you are connected. Press two to admit them yourself from the app.' },
    { action: 'input', type: ['dtmf'], dtmf: { maxDigits: 1, timeOut: 10 }, eventUrl: [dialInWebhookUrl('host-option')], eventMethod: 'POST' }];
}
export const callConversation = (call, bridge = false) => [{ action: 'conversation', name: `meeting-phone-${call.id}`, startOnEnter: bridge, endOnExit: bridge,
  eventUrl: [dialInWebhookUrl('events')], eventMethod: 'POST' }];
export const unavailableCall = (message = 'This meeting or personal PIN is unavailable. Please use your latest invitation.') => [{ action: 'talk', text: message }];

function voiceClient() {
  // A dedicated Voice application leaves existing office/voicemail webhooks intact.
  // The SIP bridge still joins the existing Video application's media session.
  const applicationId = process.env.MEETING_DIAL_IN_VOICE_APPLICATION_ID;
  requireDialInConfiguration({ allowDisabled: true });
  const privateKey = process.env.MEETING_DIAL_IN_VOICE_PRIVATE_KEY_PATH
    ? readFileSync(process.env.MEETING_DIAL_IN_VOICE_PRIVATE_KEY_PATH, 'utf8')
    : process.env.MEETING_DIAL_IN_VOICE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!privateKey) throw dialInError('The meeting Voice application key is missing.',503);
  return new Vonage({ apiKey: process.env.VONAGE_API_KEY, apiSecret: process.env.VONAGE_API_SECRET, applicationId, privateKey }).voice;
}

export const dialInTransport = {
  async connect(call, context, bridgeSecret) {
    requireDialInConfiguration();
    const client = Video.getClient();
    const token = Video.generateToken(call.video_session_id, { expireTime: Math.floor(Date.now()/1000)+120, data: JSON.stringify({
      identity: `dial-${context.userId}`, displayName: context.name, role: context.isHost ? 'host' : 'participant', roleLabel: 'Phone', dialIn: true, callId: call.id
    }) });
    return client.video.initiateSIPCall(call.video_session_id, { token, sip: {
      uri: `sip:${process.env.MEETING_DIAL_IN_NUMBER.replace('+','')}@sip-us.vonage.com;transport=tls`,
      auth: { username: process.env.VONAGE_API_KEY, password: process.env.VONAGE_API_SECRET }, secure: true,
      headers: { 'X-Meeting-Call': call.id, 'X-Meeting-Bridge': bridgeSecret }
    } });
  },
  getCall: id => voiceClient().getCall(id),
  hangup: id => voiceClient().hangupCall(id),
  disconnect: (sessionId, connectionId) => Video.disconnectClient(sessionId, connectionId),
  speak: (id, text) => voiceClient().playTTS(id, { text, language: 'en-US' }),
  async connectAudio(call, secret) {
    requireDialInConfiguration();
    const client = Video.getClient();
    const token = Video.generateToken(call.video_session_id, { role: 'subscriber', expireTime: Math.floor(Date.now()/1000)+120,
      data: JSON.stringify({ identity: `phone-transcription-${call.id}`, role: 'transcription' }) });
    return client.video.connectToWebsocket(call.video_session_id, token, {
      uri: `${dialInReadiness().origin.replace(/^https:/,'wss:')}/api/meeting-dial-in/audio`,
      streams: [call.video_stream_id], audioRate: 16000,
      headers: { 'X-Meeting-Call': call.id, 'X-Meeting-Audio': secret }
    });
  }
};
