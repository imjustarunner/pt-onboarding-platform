import { google } from 'googleapis';
import {
  buildImpersonatedJwtClient,
  logGoogleUnauthorizedHint,
  parseGoogleWorkspaceServiceAccountFromEnv,
  GOOGLE_WORKSPACE_DIRECTORY_SCOPES,
  GOOGLE_WORKSPACE_GROUPS_SETTINGS_SCOPE
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
      // 404 = not a group. 403 is Google's usual response when the address is a user
      // (or a group this admin cannot see) — treat as "not a nested group".
      if (status === 404 || status === 403) return null;
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
    whoCanJoin = 'CAN_REQUEST_TO_JOIN',
    whoCanViewMembership = 'ALL_IN_DOMAIN_CAN_VIEW',
    whoCanViewGroup = 'ALL_IN_DOMAIN_CAN_VIEW',
    whoCanPostMessage = 'ALL_IN_DOMAIN_CAN_POST',
    whoCanModerateContent = 'OWNERS_AND_MANAGERS',
    whoCanModerateMembers = 'OWNERS_AND_MANAGERS',
    whoCanContactOwner = 'ANYONE_CAN_CONTACT',
    messageModerationLevel = 'MODERATE_NONE',
    spamModerationLevel = 'MODERATE',
    allowExternalMembers = true,
    includeInGlobalAddressList = true,
    isArchived = false
  } = {}) {
    const groupEmail = String(email || '').trim().toLowerCase();
    if (!groupEmail) throw new Error('email is required');
    const admin = await this.getClient();
    const requestBody = {
      email: groupEmail,
      name: String(name || groupEmail.split('@')[0] || 'School Group').trim().slice(0, 73),
      description: String(description || '').trim().slice(0, 4096),
      whoCanJoin,
      whoCanViewMembership,
      whoCanViewGroup,
      whoCanPostMessage,
      whoCanModerateContent,
      whoCanModerateMembers,
      whoCanContactOwner,
      messageModerationLevel,
      spamModerationLevel,
      allowExternalMembers,
      includeInGlobalAddressList,
      isArchived
    };
    try {
      const result = await admin.groups.insert({ requestBody });
      return result?.data || null;
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleWorkspaceDirectoryService.createGroup' });
      throw e;
    }
  }

  /**
   * Groups Settings API (apps.groups.settings). Directory groups.update ignores
   * allowExternalMembers — school staff use district addresses outside the Workspace domain.
   */
  static async applyGroupAccessSettings({
    groupEmail,
    allowExternalMembers = true,
    whoCanJoin = 'CAN_REQUEST_TO_JOIN',
    whoCanViewMembership = 'ALL_IN_DOMAIN_CAN_VIEW',
    whoCanViewGroup = 'ALL_MEMBERS_CAN_VIEW',
    whoCanPostMessage = 'ANYONE_CAN_POST',
    whoCanModerateMembers = 'OWNERS_AND_MANAGERS',
    includeInGlobalAddressList = true,
    isArchived = false,
    messageModerationLevel = 'MODERATE_NONE',
    spamModerationLevel = 'MODERATE'
  } = {}) {
    const email = String(groupEmail || '').trim().toLowerCase();
    if (!email) throw new Error('groupEmail is required');
    const impersonate = resolveDirectoryImpersonateUser();
    const auth = await buildImpersonatedJwtClient({
      subjectEmail: impersonate,
      scopes: [...GOOGLE_WORKSPACE_DIRECTORY_SCOPES, GOOGLE_WORKSPACE_GROUPS_SETTINGS_SCOPE]
    });
    const groupssettings = google.groupssettings({ version: 'v1', auth });
    const bool = (v) => (v ? 'true' : 'false');
    try {
      const result = await groupssettings.groups.patch({
        groupUniqueId: email,
        requestBody: {
          email,
          allowExternalMembers: bool(allowExternalMembers),
          whoCanJoin,
          whoCanViewMembership,
          whoCanViewGroup,
          whoCanPostMessage,
          whoCanModerateMembers,
          includeInGlobalAddressList: bool(includeInGlobalAddressList),
          isArchived: bool(isArchived),
          messageModerationLevel,
          spamModerationLevel
        }
      });
      return result?.data || { email, allowExternalMembers: bool(allowExternalMembers) };
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleWorkspaceDirectoryService.applyGroupAccessSettings' });
      throw e;
    }
  }

  static async updateGroupSettings({
    groupEmail,
    name,
    description = '',
    whoCanJoin = 'CAN_REQUEST_TO_JOIN',
    whoCanViewMembership = 'ALL_IN_DOMAIN_CAN_VIEW',
    whoCanViewGroup = 'ALL_IN_DOMAIN_CAN_VIEW',
    whoCanPostMessage = 'ALL_IN_DOMAIN_CAN_POST',
    whoCanModerateContent = 'OWNERS_AND_MANAGERS',
    whoCanModerateMembers = 'OWNERS_AND_MANAGERS',
    whoCanContactOwner = 'ANYONE_CAN_CONTACT',
    messageModerationLevel = 'MODERATE_NONE',
    spamModerationLevel = 'MODERATE',
    allowExternalMembers = true,
    includeInGlobalAddressList = true,
    isArchived = false
  } = {}) {
    const email = String(groupEmail || '').trim().toLowerCase();
    if (!email) throw new Error('groupEmail is required');
    const admin = await this.getClient();
    try {
      const result = await admin.groups.update({
        groupKey: email,
        requestBody: {
          email,
          name: String(name || email.split('@')[0] || 'School Group').trim().slice(0, 73),
          description: String(description || '').trim().slice(0, 4096),
          whoCanJoin,
          whoCanViewMembership,
          whoCanViewGroup,
          whoCanPostMessage,
          whoCanModerateContent,
          whoCanModerateMembers,
          whoCanContactOwner,
          messageModerationLevel,
          spamModerationLevel,
          allowExternalMembers,
          includeInGlobalAddressList,
          isArchived
        }
      });
      return result?.data || null;
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleWorkspaceDirectoryService.updateGroupSettings' });
      throw e;
    }
  }

  /**
   * Add a member to a Google Group. role: MEMBER | OWNER | MANAGER
   * Nested Google Groups can only be added as type GROUP / role MEMBER via the API.
   */
  static async addGroupMember({ groupEmail, memberEmail, role = 'MEMBER' }) {
    const groupKey = String(groupEmail || '').trim().toLowerCase();
    const email = String(memberEmail || '').trim().toLowerCase();
    if (!groupKey) throw new Error('groupEmail is required');
    if (!email) throw new Error('memberEmail is required');
    const admin = await this.getClient();
    const requestedRole = String(role || 'MEMBER').toUpperCase();

    const nestedGroup = await this.getGroup({ groupEmail: email });
    const effectiveRole = nestedGroup && requestedRole !== 'MEMBER' ? 'MEMBER' : requestedRole;

    try {
      const result = await admin.members.insert({
        groupKey,
        requestBody: {
          email,
          role: effectiveRole,
          ...(nestedGroup ? { type: 'GROUP' } : {})
        }
      });
      const data = result?.data || null;
      if (nestedGroup && requestedRole !== 'MEMBER') {
        return {
          ...data,
          email,
          role: effectiveRole,
          requestedRole,
          nestedGroup: true,
          roleDowngraded: true
        };
      }
      return data;
    } catch (e) {
      const status = e?.code || e?.response?.status || null;
      if (status === 409) {
        return { email, role: effectiveRole, alreadyMember: true, nestedGroup: !!nestedGroup };
      }
      logGoogleUnauthorizedHint(e, { context: 'GoogleWorkspaceDirectoryService.addGroupMember' });
      throw e;
    }
  }

  /**
   * Remove a member from a Google Group. No-ops (returns null) when not a member.
   */
  static async removeGroupMember({ groupEmail, memberEmail }) {
    const groupKey = String(groupEmail || '').trim().toLowerCase();
    const email = String(memberEmail || '').trim().toLowerCase();
    if (!groupKey) throw new Error('groupEmail is required');
    if (!email) throw new Error('memberEmail is required');
    const admin = await this.getClient();
    try {
      await admin.members.delete({ groupKey, memberKey: email });
      return { email, removed: true };
    } catch (e) {
      const status = e?.code || e?.response?.status || null;
      if (status === 404) return { email, removed: false, notFound: true };
      logGoogleUnauthorizedHint(e, { context: 'GoogleWorkspaceDirectoryService.removeGroupMember' });
      throw e;
    }
  }

  /**
   * Update a member's delivery settings on a Google Group without removing them.
   * deliverySettings: ALL_MAIL | DIGEST | DAILY | NONE | DISABLED
   */
  static async setGroupMemberDeliverySettings({
    groupEmail,
    memberEmail,
    deliverySettings = 'NONE'
  }) {
    const groupKey = String(groupEmail || '').trim().toLowerCase();
    const email = String(memberEmail || '').trim().toLowerCase();
    const settings = String(deliverySettings || 'NONE').trim().toUpperCase() || 'NONE';
    if (!groupKey) throw new Error('groupEmail is required');
    if (!email) throw new Error('memberEmail is required');
    const admin = await this.getClient();
    try {
      const result = await admin.members.patch({
        groupKey,
        memberKey: email,
        requestBody: { deliverySettings: settings }
      });
      return result?.data || { email, deliverySettings: settings };
    } catch (e) {
      logGoogleUnauthorizedHint(e, {
        context: 'GoogleWorkspaceDirectoryService.setGroupMemberDeliverySettings'
      });
      throw e;
    }
  }

  /**
   * Permanently delete a Google Group. No-ops (returns notFound) when missing.
   */
  static async deleteGroup({ groupEmail }) {
    const email = String(groupEmail || '').trim().toLowerCase();
    if (!email) throw new Error('groupEmail is required');
    const admin = await this.getClient();
    try {
      await admin.groups.delete({ groupKey: email });
      return { email, deleted: true };
    } catch (e) {
      const status = e?.code || e?.response?.status || null;
      if (status === 404) return { email, deleted: false, notFound: true };
      logGoogleUnauthorizedHint(e, { context: 'GoogleWorkspaceDirectoryService.deleteGroup' });
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
