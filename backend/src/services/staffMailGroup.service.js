import pool from '../config/database.js';
import { reconcileManagedWorkspaceGroups } from './managedWorkspaceGroups.service.js';
import { withMessagingJobLock } from './messagingJobLock.service.js';
import Directory from './googleWorkspaceDirectory.service.js';
import { isPersonalMailboxEligibleRole, ensurePersonalMailboxForAddress } from './personalMailbox.service.js';

const normalize = (s) => String(s || '').trim().toLowerCase();
export function isActiveStaff(row) {
  return isPersonalMailboxEligibleRole(row.role) && row.status === 'ACTIVE_EMPLOYEE'
    && Number(row.is_active) === 1 && !Number(row.is_archived) && Number(row.membership_active) === 1;
}
export function staffAddresses(row) {
  return [...new Set([row.mailbox_email, row.email, row.work_email].map(normalize))]
    .filter((s) => ['itsco.health','plottwistco.com'].includes(s.split('@')[1]));
}

/** Only known staff addresses are managed. Service users, owners, and unmatched
 * legacy members are preserved and reported for review, never guessed by name.
 */
export async function reconcileStaffMailGroup({ apply = false } = {}) {
  const groupEmail = 'staff@itsco.health';
  if (!Directory.isConfigured()) return { skipped: 'directory_not_configured' };
  const [rows] = await pool.execute(`SELECT u.id,u.email,u.work_email,u.role,u.status,u.is_active,u.is_archived,
    ua.agency_id,ua.is_active AS membership_active,i.from_email AS mailbox_email,a.feature_flags
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    JOIN agencies a ON a.id=ua.agency_id AND a.slug='itsco'
    LEFT JOIN communication_inboxes i ON i.owner_user_id=u.id AND i.agency_id=ua.agency_id AND i.kind='personal'`);
  const flags = typeof rows[0]?.feature_flags === 'string' ? JSON.parse(rows[0].feature_flags || '{}') : rows[0]?.feature_flags || {};
  if (flags.managedWorkspaceGroupsEnabled === true) return { skipped: 'managed_workspace_sync_enrolled' };
  if (!rows.length || !await Directory.getGroup({ groupEmail })) return { skipped: 'staff_group_or_roster_missing' };
  const members = await Directory.listGroupMembers(groupEmail, { maxResults: 10000 });
  let ownerCount=members.filter(m=>m.role==='OWNER').length;
  const current = new Map(members.map((m) => [normalize(m.email), m]));
  const activeAddresses = new Set(rows.filter(isActiveStaff).flatMap(staffAddresses));
  const report = { added: [], removed: [], deliveryUpdated: [], missingMailbox: [], preserved: [] };
  const verified = new Map();
  async function exists(email) {
    if (!verified.has(email)) verified.set(email, !!(await Directory.getGroup({ groupEmail: email }) || await Directory.getUser({ primaryEmail: email })));
    return verified.get(email);
  }
  for (const row of rows) {
    if (!isPersonalMailboxEligibleRole(row.role)) continue;
    const addresses = staffAddresses(row);
    if (isActiveStaff(row)) {
      let email;
      for (const candidate of addresses) { if (await exists(candidate)) { email = candidate; break; } }
      if (!email) { report.missingMailbox.push(row.id); continue; }
      const member = current.get(email);
      if (!member) {
        if (apply) await Directory.addGroupMember({ groupEmail, memberEmail: email });
        report.added.push(email);
      }
      if (!member || (member.delivery_settings && member.delivery_settings !== 'ALL_MAIL')) {
        if (apply) await Directory.setGroupMemberDeliverySettings({ groupEmail, memberEmail: email, deliverySettings: 'ALL_MAIL' });
        report.deliveryUpdated.push(email);
      }
      if (apply && normalize(row.mailbox_email) !== email) {
        await ensurePersonalMailboxForAddress({ agencyId: row.agency_id, userId: row.id, fromEmail: email });
      }
    } else if (!Number(row.is_active) || Number(row.is_archived) || !Number(row.membership_active) || ['ARCHIVED','TERMINATED','TERMINATED_PENDING','COMPLETED','COMPLETED_PENDING','INACTIVE'].includes(row.status)) {
      for (const email of addresses) {
        const member = current.get(email);
        if (!member || activeAddresses.has(email)) continue;
        if (member.role === 'OWNER' && ownerCount <= 1) { report.preserved.push(email); continue; }
        if (member.role === 'OWNER') ownerCount -= 1;
        if (apply) await Directory.removeGroupMember({ groupEmail, memberEmail: email });
        current.delete(email); report.removed.push(email);
      }
    }
  }
  return report;
}

let nextRun = 0;
let running = false;
export async function tickStaffMailGroup() {
  if (running || Date.now() < nextRun) return;
  running = true;
  try { const result = await withMessagingJobLock('staff-membership', async () => {
    await reconcileStaffMailGroup({ apply: true });
    // New tenant-wide reconciliation requires explicit platform enrollment.
    // Existing tenants are audited/seeded by the CLI before enrollment.
    const reports=await reconcileManagedWorkspaceGroups({ apply:true, enrolledOnly:true });
    for(const r of Array.isArray(reports)?reports:[]) if(r.error || r.groups.some(g=>g.error)) console.warn('[managed-workspace-groups] Needs review',r.agencyId,r.error || r.groups.filter(g=>g.error).map(g=>({email:g.email,error:g.error})));
    return reports;
  }); nextRun = Date.now() + 5 * 60_000; return result; }
  finally { running = false; }
}
