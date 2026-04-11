/**
 * Voice webhooks — NOT CONFIGURED.
 * Voice has been removed. These stubs respond with a safe hangup
 * so any lingering webhook calls don't error out.
 */

import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import UserExtension from '../models/UserExtension.model.js';
import UserCallSettings from '../models/UserCallSettings.model.js';
import MessageLog from '../models/MessageLog.model.js';
import VacationScheduleSyncService from '../services/vacationScheduleSync.service.js';
import { resolveInboundRoute } from '../services/communicationRouting.service.js';

function okJson(res) {
  res.status(200).json({ ok: true });
}

function nccoJson(res, ncco) {
  res.set('Content-Type', 'application/json');
  res.status(200).json(ncco);
}

const WAIT_MUSIC_URLS = {
  classic: 'https://nexmo-community.github.io/ncco-examples/assets/voice_api_audio_world_cup.mp3',
  jazz: 'https://nexmo-community.github.io/ncco-examples/assets/voice_api_audio_jazz.mp3',
  nature: 'https://nexmo-community.github.io/ncco-examples/assets/voice_api_audio_nature.mp3',
  default: 'https://nexmo-community.github.io/ncco-examples/assets/voice_api_audio_world_cup.mp3'
};

/**
 * Inbound Voice Webhook (Vonage Answer URL)
 */
export const inboundVoiceWebhook = async (req, res, next) => {
  try {
    const { to, from } = req.query; // Vonage sends params in query string for GET Answer URL
    
    const route = await resolveInboundRoute({ toNumber: to, fromNumber: from });
    if (!route.number) {
      return nccoJson(res, [{ action: 'talk', text: 'Thank you for calling. No route found for this number.' }]);
    }

    const agency = await Agency.findById(route.agencyId);
    const hasExtensions = await UserExtension.agencyHasExtensions(route.agencyId, route.number.id);

    if (hasExtensions) {
      // Play IVR to gather extension
      return nccoJson(res, [
        {
          action: 'talk',
          text: `Welcome to ${agency?.name || 'our office'}. Please enter the extension of the person you are trying to reach, or press 0 for the operator.`,
          bargeIn: true
        },
        {
          action: 'input',
          eventUrl: [`${process.env.BACKEND_URL}/api/voice-video/voice/extension-input?toNumber=${to}`],
          maxDigits: 4,
          timeOut: 5
        }
      ]);
    }

    // No extensions: ring the assigned user or play main greeting
    return await handleConnectToUser(res, route.ownerUser?.id, route.agencyId);
  } catch (e) {
    next(e);
  }
};

/**
 * Handle Extension Input
 */
export const voiceExtensionInputWebhook = async (req, res, next) => {
  try {
    const { dtmf } = req.body;
    const { toNumber } = req.query;
    
    const number = await PhoneNumber.findByPhoneNumber(toNumber);
    const agencyId = number?.agency_id;
    if (!agencyId) return nccoJson(res, [{ action: 'talk', text: 'Error resolving agency.' }]);

    if (!dtmf || dtmf === '0') {
      // Main line / operator
      return await handleConnectToUser(res, null, agencyId, number.id);
    }

    const extension = await UserExtension.resolveExtension({ 
      agencyId, 
      numberId: number.id, 
      extension: dtmf 
    });

    if (!extension) {
      return nccoJson(res, [
        { action: 'talk', text: 'Invalid extension. Please try again.' },
        {
          action: 'input',
          eventUrl: [`${process.env.BACKEND_URL}/api/voice-video/voice/extension-input?toNumber=${toNumber}`],
          maxDigits: 4,
          timeOut: 5
        }
      ]);
    }

    return await handleConnectToUser(res, extension.user_id, agencyId);
  } catch (e) {
    next(e);
  }
};

/**
 * Helper to connect to a specific user (handling greetings, OOO, vacation)
 */
async function handleConnectToUser(res, userId, agencyId, numberId = null) {
  const settings = userId ? await UserCallSettings.getByUserId(userId) : null;
  const user = userId ? await User.findById(userId) : null;
  const agency = await Agency.findById(agencyId);

  // Check vacation mode (settings toggle OR schedule event)
  const isOnVacation = await VacationScheduleSyncService.isUserOnVacation(userId, agencyId);
  if (isOnVacation) {
    const msg = settings?.voicemail_vacation_message || 'I am currently on vacation. Please leave a message.';
    return nccoJson(res, [
      { action: 'talk', text: msg },
      {
        action: 'record',
        eventUrl: [`${process.env.BACKEND_URL}/api/voice-video/voice/voicemail-complete?userId=${userId || ''}&agencyId=${agencyId}`],
        endOnSilence: 3,
        beepStart: true,
        transcription: {
          eventUrl: [`${process.env.BACKEND_URL}/api/voice-video/voice/transcription?userId=${userId || ''}&agencyId=${agencyId}`]
        }
      }
    ]);
  }

  // TODO: Check office hours (if implemented)
  // For now, let's assume always inside hours or use OOO if not vacation.

  const targetPhone = settings?.forward_to_phone || user?.personal_phone || user?.work_phone || agency?.phone_number;
  if (!targetPhone) {
    return nccoJson(res, [{ action: 'talk', text: 'We are sorry, but no forwarding number is configured.' }]);
  }

  const waitMusic = WAIT_MUSIC_URLS[settings?.wait_music_id] || WAIT_MUSIC_URLS.default;

  return nccoJson(res, [
    {
      action: 'connect',
      from: process.env.VONAGE_NUMBER || 'ITSCO',
      timeout: 20,
      ringbackReplaced: waitMusic,
      endpoint: [
        {
          type: 'phone',
          number: MessageLog.normalizePhone(targetPhone) || targetPhone
        }
      ]
    },
    // If not answered, play voicemail
    { 
      action: 'talk', 
      text: settings?.voicemail_message || `You have reached ${user?.first_name || 'our office'}. Please leave a message after the beep.` 
    },
    {
      action: 'record',
      eventUrl: [`${process.env.BACKEND_URL}/api/voice-video/voice/voicemail-complete?userId=${userId || ''}&agencyId=${agencyId}`],
      endOnSilence: 3,
      beepStart: true,
      transcription: {
        eventUrl: [`${process.env.BACKEND_URL}/api/voice-video/voice/transcription?userId=${userId || ''}&agencyId=${agencyId}`]
      }
    }
  ]);
}

export const outboundBridgeWebhook = (req, res) => nccoJson(res, [{ action: 'talk', text: 'Connecting your call...' }]);
export const voiceConferenceJoinWebhook = (req, res) => nccoJson(res, [{ action: 'talk', text: 'Joining conference...' }]);
export const voiceDialCompleteWebhook = (req, res) => okJson(res);
export const voiceRecordingStatusWebhook = (req, res) => okJson(res);
export const voiceResumeWebhook = (req, res) => okJson(res);
export const voiceTransferDialWebhook = (req, res) => okJson(res);
export const voiceVoicemailCompleteWebhook = (req, res) => okJson(res);

export const voiceTranscriptionWebhook = async (req, res, next) => {
  try {
    const { userId, agencyId } = req.query;
    const { transcription_text, recording_url } = req.body;
    
    if (transcription_text && userId) {
      // Create a notification for the user with the transcription
      await createNotificationAndDispatch({
        type: 'voicemail_received',
        severity: 'info',
        title: 'New Voicemail Transcription',
        message: `You received a new voicemail: "${transcription_text.slice(0, 100)}..."`,
        userId: parseInt(userId, 10),
        agencyId: parseInt(agencyId, 10),
        relatedEntityType: 'call_log',
        relatedEntityId: null,
        metadata: { transcription: transcription_text, recording_url }
      });
    }
    
    okJson(res);
  } catch (e) {
    console.warn('[VoiceTranscriptionWebhook] failed:', e.message);
    okJson(res); // Still respond OK to Vonage
  }
};

export const voiceSupportNoticeWebhook = (req, res) => okJson(res);
export const voiceStatusWebhook = (req, res) => okJson(res);

