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

  /**
   * Broadcast a signal to everyone in a session (or one connection).
   */
  static async sendSignal(sessionId, { type, data = '' } = {}, connectionId = null) {
    if (!sessionId || !type) return false;
    const vonage = this.getClient();
    await vonage.video.sendSignal(
      { type: String(type), data: typeof data === 'string' ? data : JSON.stringify(data || {}) },
      String(sessionId),
      connectionId || undefined
    );
    return true;
  }

  /**
   * List active streams in a session (includes connection ids).
   */
  static async listStreams(sessionId) {
    if (!sessionId) return [];
    const vonage = this.getClient();
    const resp = await vonage.video.getStreamInfo(String(sessionId));
    const items = Array.isArray(resp?.items)
      ? resp.items
      : (Array.isArray(resp) ? resp : (resp?.data?.items || []));
    return items || [];
  }

  /**
   * Force-disconnect a client connection from the session.
   */
  static async disconnectClient(sessionId, connectionId) {
    if (!sessionId || !connectionId) return false;
    const vonage = this.getClient();
    await vonage.video.disconnectClient(String(sessionId), String(connectionId));
    return true;
  }

  /**
   * Signal guests that the interview ended, then force-disconnect matching identities
   * (e.g. user-123). Hosts/interviewers are left connected.
   */
  static async endGuestInterviewAccess(sessionId, {
    candidateUserId = null,
    details = null
  } = {}) {
    const sid = String(sessionId || '').trim();
    if (!sid || !this.isVideoConfigured()) {
      return { ok: false, signaled: false, disconnected: 0 };
    }
    let signaled = false;
    try {
      await this.sendSignal(sid, {
        type: 'interview_guest_ended',
        data: JSON.stringify({
          reason: 'interview_guest_access_ended',
          at: new Date().toISOString(),
          candidateUserId: candidateUserId != null ? Number(candidateUserId) : null,
          ...(details || {})
        })
      });
      signaled = true;
    } catch (e) {
      console.warn('[VonageVideo] sendSignal interview_guest_ended failed', e?.message || e);
    }

    const targetIdentity = candidateUserId != null ? `user-${Number(candidateUserId)}` : null;
    let disconnected = 0;
    if (targetIdentity) {
      try {
        const streams = await this.listStreams(sid);
        const connectionIds = new Set();
        for (const s of streams || []) {
          const conn = s?.connection || {};
          const cid = conn.id || s?.connectionId || conn.connectionId;
          const dataRaw = conn.data || s?.connectionData || '';
          let identity = '';
          try {
            const parsed = typeof dataRaw === 'string' && dataRaw.trim().startsWith('{')
              ? JSON.parse(dataRaw)
              : null;
            identity = String(parsed?.identity || dataRaw || '').trim();
          } catch {
            identity = String(dataRaw || '').trim();
          }
          if (cid && (identity === targetIdentity || identity.includes(targetIdentity))) {
            connectionIds.add(String(cid));
          }
        }
        for (const cid of connectionIds) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await this.disconnectClient(sid, cid);
            disconnected += 1;
          } catch (e) {
            console.warn('[VonageVideo] disconnect guest failed', cid, e?.message || e);
          }
        }
      } catch (e) {
        console.warn('[VonageVideo] list/disconnect guest interview end failed', e?.message || e);
      }
    }

    return { ok: true, signaled, disconnected };
  }

  /**
   * End a live room: signal meeting_ended, then disconnect every connection.
   */
  static async endLiveSession(sessionId, { reason = 'meeting_completed', details = null } = {}) {
    const sid = String(sessionId || '').trim();
    if (!sid || !this.isVideoConfigured()) {
      return { ok: false, signaled: false, disconnected: 0 };
    }
    let signaled = false;
    try {
      await this.sendSignal(sid, {
        type: 'meeting_ended',
        data: JSON.stringify({ reason, at: new Date().toISOString(), ...(details || {}) })
      });
      signaled = true;
    } catch (e) {
      console.warn('[VonageVideo] sendSignal meeting_ended failed', e?.message || e);
    }

    let disconnected = 0;
    try {
      const streams = await this.listStreams(sid);
      const connectionIds = new Set();
      for (const s of streams || []) {
        const cid = s?.connection?.id || s?.connectionId || s?.connection?.connectionId;
        if (cid) connectionIds.add(String(cid));
      }
      for (const cid of connectionIds) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await this.disconnectClient(sid, cid);
          disconnected += 1;
        } catch (e) {
          console.warn('[VonageVideo] disconnectClient failed', cid, e?.message || e);
        }
      }
    } catch (e) {
      console.warn('[VonageVideo] list/disconnect on endLiveSession failed', e?.message || e);
    }

    return { ok: true, signaled, disconnected };
  }
}

export default VonageVideoService;
