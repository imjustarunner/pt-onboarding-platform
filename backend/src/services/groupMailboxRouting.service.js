import pool from '../config/database.js';
import Directory from './googleWorkspaceDirectory.service.js';
import { getImpersonatedUser } from './unifiedEmail/gmailClient.js';

const norm = (s) => String(s || '').trim().toLowerCase();
/** Expand only addressed groups, never From/Reply-To. Stop at personal mailboxes:
 * their delegate/owner memberships must not grant those people another inbox's mail.
 */
export async function expandMailboxRecipients(addresses, mailboxes, listMembers) {
  const byAddress = new Map();
  for (const box of mailboxes) {
    const aliases = typeof box.inbound_addresses_json === 'string' ? JSON.parse(box.inbound_addresses_json || '[]') : box.inbound_addresses_json || [];
    for (const address of [box.from_email, ...aliases]) {
      const key=norm(address).replace(/\+[^@]+(?=@)/,'');
      if(!byAddress.has(key)) byAddress.set(key,new Map());
      byAddress.get(key).set(box.id,box);
    }
  }
  const domains = new Set(mailboxes.map((b) => norm(b.from_email).split('@')[1]));
  const pending = [...addresses]; const visited = new Set(); const found = new Map();
  while (pending.length) {
    const address = norm(pending.shift()).replace(/\+[^@]+(?=@)/, '');
    if (!address || visited.has(address) || !domains.has(address.split('@')[1])) continue;
    if (visited.size >= 500) throw new Error('Group nesting exceeds the safe routing limit');
    visited.add(address);
    let matches = [...(byAddress.get(address)?.values() || [])];
    if (matches.length > 1 && new Set(matches.map(b=>b.owner_user_id)).size === 1) {
      const tenantBoxes=matches.filter(b=>['agency','life_coach','consultant'].includes(b.organization_type));
      if(tenantBoxes.length===1) matches=tenantBoxes;
    }
    if (matches.length > 1) throw new Error(`Ambiguous personal mailbox address: ${address}`);
    if (matches.length) { found.set(matches[0].id, matches[0]); continue; }
    for (const member of await listMembers(address)) {
      if (['NONE', 'DISABLED'].includes(member.delivery_settings)) continue;
      // Users can have an app inbox too. Unmapped Google users are leaves.
      if (member.type === 'GROUP' || byAddress.has(norm(member.email))) pending.push(member.email);
    }
  }
  return [...found.values()];
}

export async function resolvePersonalMailRecipients(addresses) {
  const [boxes] = await pool.execute(`SELECT esi.*, i.id AS inbox_id, i.owner_user_id, a.organization_type FROM email_sender_identities esi
    JOIN communication_inboxes i ON i.sender_identity_id=esi.id
    JOIN agencies a ON a.id=i.agency_id
    JOIN users u ON u.id=i.owner_user_id
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=i.agency_id AND ua.is_active=1
    WHERE i.kind='personal' AND i.is_active=1 AND esi.is_active=1
      AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND u.status NOT IN ('ARCHIVED','INACTIVE','TERMINATED','TERMINATED_PENDING','COMPLETED','COMPLETED_PENDING')`);
  if (!boxes.length) return [];
  const admin = Directory.isConfigured() ? await Directory.getClient() : null;
  // Per-poll memoization supplied by caller is unnecessary: no stale membership cache
  // may keep delivering to a removed staff member.
  return expandMailboxRecipients(addresses, boxes, async (groupKey) => {
    if (!admin) return [];
    // Calendar invitations often address the app relay and actual Workspace
    // users alongside a provider Group. Those users are leaves, not Groups.
    if (norm(groupKey) === norm(getImpersonatedUser())) return [];
    try {
      if (await Directory.getUser({ primaryEmail: groupKey })) return [];
    } catch (error) {
      if (Number(error.code || error.response?.status) !== 400 || !/Type not supported: userKey/i.test(String(error.message))) throw error;
    }
    const members = []; let pageToken;
    do {
      let result;
      try { result = await admin.members.list({ groupKey, maxResults: 200, pageToken }); }
      catch (e) { if (Number(e.code || e.response?.status) === 404) return []; throw e; }
      members.push(...(result.data?.members || [])); pageToken = result.data?.nextPageToken;
    } while (pageToken);
    return members;
  });
}
