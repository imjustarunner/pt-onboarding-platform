/**
 * Twilio service — DISABLED. Voice and video providers are not configured.
 * SMS is handled by VonageService (vonage.service.js).
 * This stub exists so existing imports don't crash.
 */

class TwilioService {
  static _notConfigured() {
    throw new Error('Voice provider not configured');
  }

  static getClient() { this._notConfigured(); }
  static async sendSms() { this._notConfigured(); }
  static async searchAvailableLocalNumbers() { this._notConfigured(); }
  static async purchaseNumber() { this._notConfigured(); }
  static async releaseNumber() { this._notConfigured(); }
  static async getIncomingNumber() { this._notConfigured(); }
  static async updateIncomingNumberWebhooks() { this._notConfigured(); }
  static validateWebhook() { return false; }
  static async createCall() { this._notConfigured(); }
  static async updateCall() { this._notConfigured(); }
  static getRecordingMediaUrl() { return null; }
  static async downloadRecordingMedia() { this._notConfigured(); }
}

export default TwilioService;
