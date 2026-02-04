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

  static async purchaseNumber({ phoneNumber, friendlyName = null, smsUrl = null }) {
    const client = this.getClient();
    const payload = { phoneNumber };
    if (friendlyName) payload.friendlyName = friendlyName;
    if (smsUrl) payload.smsUrl = smsUrl;
    const result = await client.incomingPhoneNumbers.create(payload);
    return result;
  }

  static async releaseNumber({ incomingPhoneNumberSid }) {
    const client = this.getClient();
    await client.incomingPhoneNumbers(incomingPhoneNumberSid).remove();
    return true;
  }

  static validateWebhook({ url, params, signature }) {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) return false;
    return twilio.validateRequest(authToken, signature, url, params);
  }
}

export default TwilioService;

