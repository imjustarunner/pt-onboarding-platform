import { Vonage } from '@vonage/server-sdk';

class VonageService {
  static getClient() {
    const apiKey = process.env.VONAGE_API_KEY;
    const apiSecret = process.env.VONAGE_API_SECRET;
    if (!apiKey || !apiSecret) {
      throw new Error('Vonage not configured (missing VONAGE_API_KEY/VONAGE_API_SECRET)');
    }
    return new Vonage({ apiKey, apiSecret });
  }

  static async sendSms({ to, from, body, mediaUrl = null }) {
    const vonage = this.getClient();
    // Vonage SMS API does not support MMS for US numbers via the SMS API.
    // mediaUrl is accepted for interface compatibility but not transmitted.
    if (mediaUrl) {
      console.warn('[VonageService] sendSms: mediaUrl provided but Vonage SMS API does not support MMS. Text-only message will be sent.');
    }
    const result = await vonage.sms.send({ to, from, text: body });
    const msg = result?.messages?.[0];
    if (!msg || String(msg.status) !== '0') {
      const errText = msg?.['error-text'] || 'Unknown error';
      const errStatus = msg?.status ?? 'no_response';
      throw new Error(`Vonage SMS failed (status ${errStatus}): ${errText}`);
    }
    // Return shape compatible with what callers expect from Twilio.
    return {
      sid: msg['message-id'] || msg.messageId || null,
      status: 'sent',
      to: msg.to,
    };
  }

  static async searchAvailableLocalNumbers({ country = 'US', areaCode = null, limit = 20 }) {
    const vonage = this.getClient();
    const params = { features: 'SMS', type: 'mobile-lvn', size: limit };
    if (areaCode) params.areaCode = String(areaCode);
    const result = await vonage.numbers.getAvailableNumbers(country, params);
    const list = result?.numbers || result?.available_numbers || [];
    return list.map((n) => ({
      phoneNumber: n.msisdn ? `+${n.msisdn}` : null,
      friendlyName: n.msisdn || null,
      capabilities: {
        sms: Array.isArray(n.features) ? n.features.includes('SMS') : true,
        voice: Array.isArray(n.features) ? n.features.includes('VOICE') : false,
        mms: false,
      },
    }));
  }

  /**
   * Purchase a Vonage number and optionally set its SMS/voice webhook URLs.
   * Returns a shape compatible with Twilio purchaseNumber callers.
   * Note: Vonage numbers use msisdn (digits only) instead of Twilio SIDs.
   * The msisdn is stored in the `twilio_sid` DB column for reference.
   */
  static async purchaseNumber({ phoneNumber, friendlyName = null, smsUrl = null, voiceUrl = null }) {
    const vonage = this.getClient();
    const msisdn = String(phoneNumber || '').replace(/^\+/, '');
    await vonage.numbers.buyNumber({ country: 'US', msisdn });

    if (smsUrl || voiceUrl) {
      try {
        const updateParams = { msisdn, country: 'US' };
        if (smsUrl) updateParams.moHttpUrl = smsUrl;
        if (voiceUrl) updateParams.voHttpUrl = voiceUrl;
        await vonage.numbers.updateNumber(updateParams);
      } catch (e) {
        console.warn('[VonageService] purchaseNumber: webhook update failed after buy:', e?.message);
      }
    }

    return {
      phoneNumber: `+${msisdn}`,
      // Store msisdn in the sid field so it can be used for future API calls.
      sid: msisdn,
      friendlyName: friendlyName || null,
      capabilities: { sms: true, voice: true, mms: false },
    };
  }

  /**
   * Release (cancel) a Vonage number.
   * `incomingPhoneNumberSid` is the msisdn stored in the DB twilio_sid column.
   */
  static async releaseNumber({ incomingPhoneNumberSid }) {
    const vonage = this.getClient();
    const msisdn = String(incomingPhoneNumberSid || '').replace(/^\+/, '');
    await vonage.numbers.cancelNumber({ country: 'US', msisdn });
    return true;
  }

  /**
   * Fetch current webhook config for a Vonage number.
   * `incomingPhoneNumberSid` = msisdn stored in DB.
   */
  static async getIncomingNumber({ incomingPhoneNumberSid }) {
    const vonage = this.getClient();
    const msisdn = String(incomingPhoneNumberSid || '').replace(/^\+/, '');
    const result = await vonage.numbers.getOwnedNumbers({ msisdn });
    const number = (result?.numbers || [])[0] || null;
    if (!number) throw new Error(`Vonage number not found: ${msisdn}`);
    return {
      smsUrl: number.moHttpUrl || number.mo_http_url || null,
      voiceUrl: number.voHttpUrl || number.vo_http_url || null,
      msisdn: number.msisdn,
    };
  }

  /**
   * Update SMS and/or voice webhook URLs on a Vonage number.
   * `incomingPhoneNumberSid` = msisdn stored in DB.
   */
  static async updateIncomingNumberWebhooks({
    incomingPhoneNumberSid,
    smsUrl = null,
    voiceUrl = null,
  }) {
    const vonage = this.getClient();
    const msisdn = String(incomingPhoneNumberSid || '').replace(/^\+/, '');
    const params = { msisdn, country: 'US' };
    if (smsUrl !== null) params.moHttpUrl = smsUrl;
    if (voiceUrl !== null) params.voHttpUrl = voiceUrl;
    const result = await vonage.numbers.updateNumber(params);
    return {
      smsUrl: result?.moHttpUrl || smsUrl || null,
      voiceUrl: result?.voHttpUrl || voiceUrl || null,
    };
  }

  /**
   * Validate an inbound Vonage webhook signature.
   * Vonage signs requests using HMAC-MD5 over sorted params with VONAGE_SIGNATURE_SECRET.
   */
  static validateWebhook({ params, signature }) {
    const vonage = this.getClient();
    return vonage.sms.verifySignature(params, signature, process.env.VONAGE_SIGNATURE_SECRET || '');
  }
}

export default VonageService;
