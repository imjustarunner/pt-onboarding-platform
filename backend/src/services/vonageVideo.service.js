import { Vonage } from '@vonage/server-sdk';
import { readFileSync } from 'fs';

function normalizePrivateKey(raw) {
  if (raw == null) return null;
  let key = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  // Cloud Run / secret managers often store PEM with literal \n sequences.
  if (key.includes('\\n') && !key.includes('\n')) {
    key = key.replace(/\\n/g, '\n');
  }
  return key.trim();
}

/** Client OT.initSession project id: Application ID (unified) or legacy OpenTok project key. */
export function resolveVideoProjectId() {
  const applicationId = String(process.env.VONAGE_APPLICATION_ID || '').trim() || null;
  // Optional legacy OpenTok project API key (numeric). Never fall back to account VONAGE_API_KEY —
  // that is the Vonage dashboard account key and will cause OT_AUTHENTICATION_ERROR with JWT tokens.
  const legacyProjectKey = String(process.env.VONAGE_VIDEO_API_KEY || '').trim() || null;
  return applicationId || legacyProjectKey || null;
}

class VonageVideoService {
  static getClient() {
    const apiKey = process.env.VONAGE_API_KEY;
    const apiSecret = process.env.VONAGE_API_SECRET;
    const applicationId = process.env.VONAGE_APPLICATION_ID;
    const privateKeyPath = process.env.VONAGE_PRIVATE_KEY_PATH;
    const privateKeyString = process.env.VONAGE_PRIVATE_KEY;

    if (!apiKey || !apiSecret) {
      throw new Error('Vonage not configured (missing VONAGE_API_KEY/VONAGE_API_SECRET)');
    }

    if (!applicationId || (!privateKeyPath && !privateKeyString)) {
      throw new Error('Vonage Video not configured (missing VONAGE_APPLICATION_ID and VONAGE_PRIVATE_KEY)');
    }

    const options = { apiKey, apiSecret };
    options.applicationId = applicationId;

    if (privateKeyPath) {
      options.privateKey = normalizePrivateKey(readFileSync(privateKeyPath));
    } else if (privateKeyString) {
      options.privateKey = normalizePrivateKey(privateKeyString);
    }

    return new Vonage(options);
  }

  static isVideoConfigured() {
    return !!(
      process.env.VONAGE_API_KEY &&
      process.env.VONAGE_API_SECRET &&
      process.env.VONAGE_APPLICATION_ID &&
      (process.env.VONAGE_PRIVATE_KEY || process.env.VONAGE_PRIVATE_KEY_PATH)
    );
  }

  /**
   * Create a new Vonage Video session.
   * @param {Object} options - Session options (e.g., mediaMode: 'routed' or 'relayed')
   * @returns {Promise<string>} The sessionId.
   */
  static async createSession(options = {}) {
    const vonage = this.getClient();
    // Use routed mode by default to enable archiving and more than 2 participants reliably.
    const sessionOptions = { mediaMode: 'routed', ...options };
    const session = await vonage.video.createSession(sessionOptions);
    return session.sessionId;
  }

  /**
   * Generate a client token for a Vonage Video session.
   * @param {string} sessionId - The session ID to generate a token for.
   * @param {Object} options - Token options (role, data, initialLayoutClassList)
   * @returns {string} The generated token.
   */
  static generateToken(sessionId, options = {}) {
    const vonage = this.getClient();
    // Default token role is 'publisher'
    const tokenOptions = { role: 'publisher', ...options };
    return vonage.video.generateClientToken(sessionId, tokenOptions);
  }

  /**
   * Start an archive (recording) for a session.
   */
  static async startArchive(sessionId, options = {}) {
    const vonage = this.getClient();
    return await vonage.video.startArchive(sessionId, options);
  }

  /**
   * Stop an archive.
   */
  static async stopArchive(archiveId) {
    const vonage = this.getClient();
    return await vonage.video.stopArchive(archiveId);
  }

  /**
   * Get archive info.
   */
  static async getArchive(archiveId) {
    const vonage = this.getClient();
    return await vonage.video.getArchive(archiveId);
  }
}

export default VonageVideoService;
