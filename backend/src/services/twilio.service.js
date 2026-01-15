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

  static validateWebhook({ url, params, signature }) {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) return false;
    return twilio.validateRequest(authToken, signature, url, params);
  }
}

export default TwilioService;

