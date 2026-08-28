import { google } from 'googleapis';
import {
  buildImpersonatedJwtClient,
  logGoogleUnauthorizedHint,
  parseGoogleWorkspaceServiceAccountFromEnv,
  GOOGLE_WORKSPACE_DIRECTORY_SCOPES
} from './googleWorkspaceAuth.service.js';

function resolveDirectoryImpersonateUser() {
  return String(
    process.env.GOOGLE_WORKSPACE_DIRECTORY_IMPERSONATE_USER ||
      process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER ||
      ''
  )
    .trim()
    .toLowerCase();
}

class GoogleWorkspaceDirectoryService {
  static isConfigured() {
    const sa = parseGoogleWorkspaceServiceAccountFromEnv();
    return !!(sa?.client_email && sa?.private_key && resolveDirectoryImpersonateUser());
  }

  static async getClient() {
    const impersonate = resolveDirectoryImpersonateUser();
    if (!impersonate) {
      throw new Error(
        'Missing GOOGLE_WORKSPACE_DIRECTORY_IMPERSONATE_USER (or GOOGLE_WORKSPACE_IMPERSONATE_USER fallback)'
      );
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

  /**
   * List Google Groups a user is a member of (paginated).
   */
  static async listGroupsForMember(memberEmail, { maxResults = 200 } = {}) {
    const userKey = String(memberEmail || '').trim().toLowerCase();
    if (!userKey) throw new Error('memberEmail is required');
    const admin = await this.getClient();
    const groups = [];
    let pageToken = undefined;
    try {
      do {
        const result = await admin.groups.list({
          userKey,
          maxResults: Math.min(200, maxResults),
          pageToken
        });
        const batch = result?.data?.groups || [];
        groups.push(...batch);
        pageToken = result?.data?.nextPageToken || undefined;
        if (groups.length >= maxResults) break;
      } while (pageToken);
      return groups.slice(0, maxResults);
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleWorkspaceDirectoryService.listGroupsForMember' });
      throw e;
    }
  }

  /**
   * List members of a Google Group (paginated).
   */
  static async listGroupMembers(groupEmail, { maxResults = 500 } = {}) {
    const groupKey = String(groupEmail || '').trim().toLowerCase();
    if (!groupKey) throw new Error('groupEmail is required');
    const admin = await this.getClient();
    const members = [];
    let pageToken = undefined;
    try {
      do {
        const result = await admin.members.list({
          groupKey,
          maxResults: Math.min(200, maxResults),
          pageToken
        });
        const batch = result?.data?.members || [];
        members.push(...batch);
        pageToken = result?.data?.nextPageToken || undefined;
        if (members.length >= maxResults) break;
      } while (pageToken);
      return members.slice(0, maxResults);
    } catch (e) {
      const status = e?.code || e?.response?.status || null;
      if (status === 404) return [];
      logGoogleUnauthorizedHint(e, { context: 'GoogleWorkspaceDirectoryService.listGroupMembers' });
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

  /**
   * Lookup a Google Group by email. Returns null when not found.
   */
  static async getGroup({ groupEmail }) {
    const email = String(groupEmail || '').trim().toLowerCase();
    if (!email) throw new Error('groupEmail is required');
    const admin = await this.getClient();
    try {
      const result = await admin.groups.get({ groupKey: email });
      return result?.data || null;
    } catch (e) {
      const status = e?.code || e?.response?.status || null;
      if (status === 404) return null;
      logGoogleUnauthorizedHint(e, { context: 'GoogleWorkspaceDirectoryService.getGroup' });
      throw e;
    }
  }

  /**
   * Create a Google Group (used as hire work-email mailbox without a Workspace user).
   */
  static async createGroup({
    email,
    name,
    description = '',
    whoCanJoin = 'INVITED_CAN_JOIN',
    whoCanViewMembership = 'ALL_IN_DOMAIN_CAN_VIEW',
    whoCanPostMessage = 'ANYONE_CAN_POST',
    allowExternalMembers = true,
    includeInGlobalAddressList = true
  } = {}) {
    const groupEmail = String(email || '').trim().toLowerCase();
    if (!groupEmail) throw new Error('email is required');
    const admin = await this.getClient();
    try {
      const result = await admin.groups.insert({
        requestBody: {
          email: groupEmail,
          name: String(name || groupEmail.split('@')[0] || 'New Hire').trim().slice(0, 73),
          description: String(description || '').trim().slice(0, 4096)
        }
      });
      // Best-effort settings (Admin SDK groups.update may ignore unknown fields on some tenants).
      try {
        await admin.groups.update({
          groupKey: groupEmail,
          requestBody: {
            email: groupEmail,
            name: String(name || groupEmail.split('@')[0] || 'New Hire').trim().slice(0, 73),
            description: String(description || '').trim().slice(0, 4096),
            whoCanJoin,
            whoCanViewMembership,
            whoCanPostMessage,
            allowExternalMembers,
            includeInGlobalAddressList
          }
        });
      } catch {
        // Group exists even if settings patch fails.
      }
      return result?.data || null;
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleWorkspaceDirectoryService.createGroup' });
      throw e;
    }
  }

  /**
   * Add a member to a Google Group. role: MEMBER | OWNER | MANAGER
   */
  static async addGroupMember({ groupEmail, memberEmail, role = 'MEMBER' }) {
    const groupKey = String(groupEmail || '').trim().toLowerCase();
    const email = String(memberEmail || '').trim().toLowerCase();
    if (!groupKey) throw new Error('groupEmail is required');
    if (!email) throw new Error('memberEmail is required');
    const admin = await this.getClient();
    try {
      const result = await admin.members.insert({
        groupKey,
        requestBody: {
          email,
          role: String(role || 'MEMBER').toUpperCase()
        }
      });
      return result?.data || null;
    } catch (e) {
      const status = e?.code || e?.response?.status || null;
      // Already a member
      if (status === 409) {
        return { email, role, alreadyMember: true };
      }
      logGoogleUnauthorizedHint(e, { context: 'GoogleWorkspaceDirectoryService.addGroupMember' });
      throw e;
    }
  }

  /**
   * True when neither a Workspace user nor a Group owns this address.
   */
  static async isDirectoryEmailAvailable(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) return false;
    const [user, group] = await Promise.all([
      this.getUser({ primaryEmail: normalized }),
      this.getGroup({ groupEmail: normalized })
    ]);
    return !user && !group;
  }
}

export default GoogleWorkspaceDirectoryService;
