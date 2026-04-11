/**
 * Voice webhooks — NOT CONFIGURED.
 * Twilio Voice has been removed. These stubs respond with a safe TwiML hangup
 * so any lingering webhook calls don't error out.
 */

function hangupTwiml(res) {
  res.set('Content-Type', 'text/xml');
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
}

function okJson(res) {
  res.status(200).json({ ok: true, message: 'Voice provider not configured' });
}

export const inboundVoiceWebhook = (req, res) => hangupTwiml(res);
export const outboundBridgeWebhook = (req, res) => hangupTwiml(res);
export const voiceConferenceJoinWebhook = (req, res) => hangupTwiml(res);
export const voiceDialCompleteWebhook = (req, res) => okJson(res);
export const voiceRecordingStatusWebhook = (req, res) => okJson(res);
export const voiceResumeWebhook = (req, res) => hangupTwiml(res);
export const voiceTransferDialWebhook = (req, res) => hangupTwiml(res);
export const voiceVoicemailCompleteWebhook = (req, res) => okJson(res);
export const voiceSupportNoticeWebhook = (req, res) => okJson(res);
export const voiceStatusWebhook = (req, res) => okJson(res);
