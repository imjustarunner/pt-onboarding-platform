import { Vonage } from '@vonage/server-sdk';
import { prepareSmsDelivery } from './smsCompliance.service.js';

class VonageService {
  static getClient() {
    const apiKey = process.env.VONAGE_API_KEY;
    const apiSecret = process.env.VONAGE_API_SECRET;
    const applicationId = process.env.VONAGE_APPLICATION_ID;
    
    // In production/Cloud Run, we pass the private key as a string in VONAGE_PRIVATE_KEY
    // In local dev, we might use VONAGE_PRIVATE_KEY_PATH pointing to a file.
    const privateKey = process.env.VONAGE_PRIVATE_KEY || process.env.VONAGE_PRIVATE_KEY_PATH || './vonage_private.key';
    
    if (!apiKey || !apiSecret) {
      throw new Error('Vonage not configured (missing VONAGE_API_KEY/VONAGE_API_SECRET)');
    }
    
    const config = { apiKey, apiSecret };
    if (applicationId) {
      config.applicationId = applicationId;
      config.privateKey = privateKey;
    }
    
    return new Vonage(config);
  }

  static async sendSms(options) {
    const { to, from, body } = await prepareSmsDelivery(options);
    const vonage = this.getClient();
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
    const normalizedCountry = String(country || 'US').toUpperCase();
    const code = areaCode == null ? '' : String(areaCode).trim();
    if (code && (!['US','CA'].includes(normalizedCountry) || !/^[2-9]\d{2}$/.test(code))) {
      throw Object.assign(new Error('Use a three-digit US or Canadian area code.'), {status:400});
    }
    const size = Math.max(1, Math.min(50, Number.parseInt(limit,10) || 20));
    const prefix = code ? `1${code}` : null;
    const vonage = this.getClient();
    // Installed SDK takes one filter object. areaCode is not a Vonage filter;
    // prefix matching uses E.164 country code + area code.
    const params = {country:normalizedCountry,features:['SMS','VOICE'],type:'mobile-lvn',size};
    if (prefix) { params.pattern=prefix; params.searchPattern=0; }
    const result = await vonage.numbers.getAvailableNumbers(params);
    const list = result?.numbers || result?.available_numbers || [];
    return list.filter(n => n.msisdn && (!prefix || String(n.msisdn).replace(/^\+/, '').startsWith(prefix)))
      .map((n) => ({
        phoneNumber: `+${String(n.msisdn).replace(/^\+/, '')}`,
        friendlyName: n.msisdn,
        monthlyCostEUR: n.cost ?? null,
        initialPriceEUR: n.initialPrice ?? null,
        capabilities: {
          sms: Array.isArray(n.features) && n.features.includes('SMS'),
          voice: Array.isArray(n.features) && n.features.includes('VOICE'),
          mms: Array.isArray(n.features) && n.features.includes('MMS'),
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
    const purchase = await vonage.numbers.buyNumber({ country: 'US', msisdn });
    const code = purchase?.errorCode ?? purchase?.['error-code'];
    if (String(code) !== '200') {
      throw new Error(`Vonage number purchase failed (status ${code ?? 'unknown'}). Verify owned inventory before retrying.`);
    }

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
   * Use the SMS API signing algorithm configured on the Vonage account.
   */
  static validateWebhook({ params, signature }) {
    const vonage = this.getClient();
    const secret = process.env.VONAGE_SIGNATURE_SECRET;
    if (!secret) return false;
    const algorithm = String(process.env.VONAGE_SIGNATURE_ALGORITHM || 'MD5HASH').toUpperCase();
    const normalized = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)]));
    return vonage.sms.verifySignature(signature, normalized, secret, algorithm);
  }

  /**
   * Create a Vonage RTC User.
   */
  static async createRtcUser({ name, displayName = null, imageUrl = null }) {
    const vonage = this.getClient();
    const user = await vonage.users.createUser({
      name,
      displayName: displayName || name,
      imageUrl: imageUrl || null
    });
    return user;
  }

  /**
   * Generate a JWT for a Vonage User to join a conversation or join the RTC SDK.
   */
  static generateRtcJwt(userName) {
    const vonage = this.getClient();
    // Use the built-in JWT generator if available, or manual if not.
    // The @vonage/server-sdk has a generateJwt method.
    return vonage.generateJwt({
      sub: userName,
      acl: {
        paths: {
          '/*/users/**': {},
          '/*/conversations/**': {},
          '/*/sessions/**': {},
          '/*/devices/**': {},
          '/*/image/**': {},
          '/*/media/**': {},
          '/*/applications/**': {},
          '/*/push/**': {},
          '/*/knocking/**': {}
        }
      }
    });
  }
}

export default VonageService;
