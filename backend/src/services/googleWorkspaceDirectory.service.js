import { google } from 'googleapis';
import {
  buildImpersonatedJwtClient,
  logGoogleUnauthorizedHint,
  parseGoogleWorkspaceServiceAccountFromEnv,
  GOOGLE_WORKSPACE_DIRECTORY_SCOPES
} from './googleWorkspaceAuth.service.js';

class GoogleWorkspaceDirectoryService {
  static isConfigured() {
    const sa = parseGoogleWorkspaceServiceAccountFromEnv();
    return !!(sa?.client_email && sa?.private_key && process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER);
  }

  static async getClient() {
    const impersonate = String(process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER || '').trim().toLowerCase();
    if (!impersonate) {
      throw new Error('Missing GOOGLE_WORKSPACE_IMPERSONATE_USER');
    }
    const auth = await buildImpersonatedJwtClient({
      subjectEmail: impersonate,
      scopes: GOOGLE_WORKSPACE_DIRECTORY_SCOPES
    });
    return google.admin({ version: 'directory_v1', auth });
  }

  static async getUser({ primaryEmail }) {
    const email = String(primaryEmail || '').trim().toLowerCase();
    if (!email) throw new Error('primaryEmail is required');
    const admin = await this.getClient();
    try {
      const result = await admin.users.get({ userKey: email });
      return result?.data || null;
    } catch (e) {
      const status = e?.code || e?.response?.status || null;
      if (status === 404) return null;
      logGoogleUnauthorizedHint(e, { context: 'GoogleWorkspaceDirectoryService.getUser' });
      throw e;
    }
  }

  static async createUser({ primaryEmail, givenName, familyName, password, recoveryEmail }) {
    const email = String(primaryEmail || '').trim().toLowerCase();
    if (!email) throw new Error('primaryEmail is required');
    const admin = await this.getClient();
    try {
      const result = await admin.users.insert({
        requestBody: {
          primaryEmail: email,
          name: {
            givenName: String(givenName || '').trim() || 'New',
            familyName: String(familyName || '').trim() || 'User'
          },
          password: String(password || ''),
          changePasswordAtNextLogin: true,
          recoveryEmail: recoveryEmail ? String(recoveryEmail).trim().toLowerCase() : undefined
        }
      });
      return result?.data || null;
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleWorkspaceDirectoryService.createUser' });
      throw e;
    }
  }
}

export default GoogleWorkspaceDirectoryService;
