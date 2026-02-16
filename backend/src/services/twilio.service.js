import twilio from 'twilio';

class TwilioService {
  static getClient() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error('Twilio not configured (missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN)');
    }
    return twilio(accountSid, authToken);
  }

  static async sendSms({ to, from, body }) {
    const client = this.getClient();
    const msg = await client.messages.create({ to, from, body });
    return msg; // includes sid/status
  }

  static async searchAvailableLocalNumbers({ country = 'US', areaCode = null, limit = 20 }) {
    const client = this.getClient();
    const params = {};
    if (areaCode) params.areaCode = areaCode;
    const list = await client.availablePhoneNumbers(country).local.list({ ...params, limit });
    return list || [];
  }

  static async purchaseNumber({ phoneNumber, friendlyName = null, smsUrl = null, voiceUrl = null }) {
    const client = this.getClient();
    const payload = { phoneNumber };
    if (friendlyName) payload.friendlyName = friendlyName;
    if (smsUrl) payload.smsUrl = smsUrl;
    if (voiceUrl) payload.voiceUrl = voiceUrl;
    if (smsUrl) payload.smsMethod = 'POST';
    if (voiceUrl) payload.voiceMethod = 'POST';
    const result = await client.incomingPhoneNumbers.create(payload);
    return result;
  }

  static async releaseNumber({ incomingPhoneNumberSid }) {
    const client = this.getClient();
    await client.incomingPhoneNumbers(incomingPhoneNumberSid).remove();
    return true;
  }

  static async getIncomingNumber({ incomingPhoneNumberSid }) {
    const client = this.getClient();
    const number = await client.incomingPhoneNumbers(incomingPhoneNumberSid).fetch();
    return number;
  }

  static async updateIncomingNumberWebhooks({
    incomingPhoneNumberSid,
    smsUrl = null,
    voiceUrl = null,
    smsMethod = 'POST',
    voiceMethod = 'POST'
  }) {
    const client = this.getClient();
    const payload = {};
    if (smsUrl !== undefined && smsUrl !== null) {
      payload.smsUrl = smsUrl;
      payload.smsMethod = smsMethod;
    }
    if (voiceUrl !== undefined && voiceUrl !== null) {
      payload.voiceUrl = voiceUrl;
      payload.voiceMethod = voiceMethod;
    }
    const updated = await client.incomingPhoneNumbers(incomingPhoneNumberSid).update(payload);
    return updated;
  }

  static validateWebhook({ url, params, signature }) {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) return false;
    return twilio.validateRequest(authToken, signature, url, params);
  }

  static async createCall({ to, from, url, statusCallback = null, record = false }) {
    const client = this.getClient();
    const payload = { to, from, url, method: 'POST' };
    if (statusCallback) {
      payload.statusCallback = statusCallback;
      payload.statusCallbackMethod = 'POST';
      payload.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed'];
    }
    if (record) payload.record = true;
    const call = await client.calls.create(payload);
    return call;
  }

  static getRecordingMediaUrl({ recordingSid, format = 'mp3' }) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    if (!accountSid || !recordingSid) return null;
    const ext = String(format || 'mp3').toLowerCase() === 'wav' ? 'wav' : 'mp3';
    return `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.${ext}`;
  }

  static async downloadRecordingMedia({ recordingSid, format = 'mp3' }) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error('Twilio not configured (missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN)');
    }
    const url = this.getRecordingMediaUrl({ recordingSid, format });
    if (!url) throw new Error('Invalid recordingSid');
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` }
    });
    if (!resp.ok) {
      throw new Error(`Twilio recording download failed (${resp.status})`);
    }
    const arrayBuffer = await resp.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

export default TwilioService;

