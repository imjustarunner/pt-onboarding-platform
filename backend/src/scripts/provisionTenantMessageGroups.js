/**
 * Provision messages@ / securemessage@ Google Groups + Gmail Send-as on ai@
 * for the six locked tenant domains, and upsert DB identities/inboxes.
 *
 * Usage:
 *   node backend/src/scripts/provisionTenantMessageGroups.js
 *   node backend/src/scripts/provisionTenantMessageGroups.js --dry-run
 *   node backend/src/scripts/provisionTenantMessageGroups.js --domain=itsco.health
 *
 * Ops: After adding gmail.settings.sharing to DWD, re-authorize the service
 * account client ID in Google Admin before this script can create Send-as.
 */
import pool from '../config/database.js';
import GoogleWorkspaceDirectoryService from '../services/googleWorkspaceDirectory.service.js';
import { ensureSendAsAlias } from '../services/gmailSendAs.service.js';
import {
  TENANT_MESSAGE_DOMAINS,
  ensureTenantMessageMailboxes
} from '../services/tenantMessageMailboxes.service.js';

const OWNER_EMAIL = 'michael@plottwistco.com';
const MANAGER_EMAIL = 'ai@plottwistco.com';
const LOCAL_PARTS = ['messages', 'securemessage'];

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const domainArg = argv.find((a) => a.startsWith('--domain='));
  const domain = domainArg ? domainArg.split('=')[1].trim().toLowerCase() : null;
  return { dryRun, domain };
}

async function ensureGroupWithRoles(groupEmail, displayName, { dryRun }) {
  if (dryRun) {
    console.log(`[dry-run] would ensure group ${groupEmail}`);
    return { email: groupEmail, dryRun: true };
  }

  let group = await GoogleWorkspaceDirectoryService.getGroup({ groupEmail }).catch(() => null);
  if (!group) {
    group = await GoogleWorkspaceDirectoryService.createGroup({
      email: groupEmail,
      name: displayName,
      description: `PlotTwistHQ ${displayName} mailbox — app-managed`,
      whoCanPostMessage: 'ANYONE_CAN_POST',
      allowExternalMembers: true,
      includeInGlobalAddressList: true
    });
    console.log(`[created] group ${groupEmail}`);
  } else {
    console.log(`[exists] group ${groupEmail}`);
  }

  try {
    await GoogleWorkspaceDirectoryService.applyGroupAccessSettings({
      groupEmail,
      allowExternalMembers: true,
      whoCanPostMessage: 'ANYONE_CAN_POST',
      whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW'
    });
  } catch (e) {
    console.warn(`[warn] group settings ${groupEmail}:`, e?.message || e);
  }

  // OWNER michael@ (delivery muted), MANAGER ai@
  for (const { email, role, delivery } of [
    { email: OWNER_EMAIL, role: 'OWNER', delivery: 'NONE' },
    { email: MANAGER_EMAIL, role: 'MANAGER', delivery: 'ALL_MAIL' }
  ]) {
    try {
      await GoogleWorkspaceDirectoryService.addGroupMember({
        groupEmail,
        memberEmail: email,
        role
      });
    } catch (e) {
      const msg = String(e?.message || e?.response?.data?.error?.message || e);
      if (!/already|Member already exists|duplicate/i.test(msg)) {
        console.warn(`[warn] add ${role} ${email} → ${groupEmail}:`, msg);
      }
    }
    try {
      await GoogleWorkspaceDirectoryService.setGroupMemberDeliverySettings({
        groupEmail,
        memberEmail: email,
        deliverySettings: delivery
      });
    } catch (e) {
      console.warn(`[warn] delivery ${email} on ${groupEmail}:`, e?.message || e);
    }
  }

  return group;
}

async function listAgenciesForDomain(domain) {
  const [rows] = await pool.execute(
    `SELECT id, name, slug, feature_flags FROM agencies
     WHERE COALESCE(organization_type, 'agency') <> 'school'
     ORDER BY id ASC`
  );
  const hits = [];
  for (const r of rows || []) {
    let flags = {};
    try {
      flags = typeof r.feature_flags === 'string' ? JSON.parse(r.feature_flags || '{}') : r.feature_flags || {};
    } catch {
      flags = {};
    }
    const d = String(flags.workspaceEmailDomain || flags.mailDomain || '')
      .trim()
      .toLowerCase()
      .replace(/^@/, '');
    if (d === domain) hits.push(r);
  }
  return hits;
}

async function main() {
  const { dryRun, domain: onlyDomain } = parseArgs(process.argv.slice(2));
  const domains = onlyDomain
    ? TENANT_MESSAGE_DOMAINS.filter((d) => d === onlyDomain)
    : [...TENANT_MESSAGE_DOMAINS];

  if (onlyDomain && !domains.length) {
    console.error(`Domain ${onlyDomain} is not in the locked tenant list`);
    process.exit(1);
  }

  const results = [];

  for (const domain of domains) {
    console.log(`\n=== ${domain} ===`);
    for (const local of LOCAL_PARTS) {
      const email = `${local}@${domain}`;
      const displayName = local === 'messages' ? `Messages (${domain})` : `Secure Messages (${domain})`;
      try {
        await ensureGroupWithRoles(email, displayName, { dryRun });
        if (!dryRun) {
          const sendAs = await ensureSendAsAlias({
            impersonateUser: MANAGER_EMAIL,
            sendAsEmail: email,
            displayName: local === 'messages' ? 'Messages' : 'Secure Messages',
            treatAsAlias: true,
            replyToAddress: local === 'securemessage' ? `noreply@${domain}` : email
          });
          console.log(`[send-as] ${email}:`, sendAs.ok ? (sendAs.created ? 'created' : 'ok') : sendAs.error);
          results.push({ domain, email, group: true, sendAs });
        } else {
          console.log(`[dry-run] would ensure Send-as ${email} on ${MANAGER_EMAIL}`);
          results.push({ domain, email, dryRun: true });
        }
      } catch (e) {
        console.error(`[error] ${email}:`, e?.message || e);
        results.push({ domain, email, error: e?.message || String(e) });
      }
    }

    // Upsert DB identities for agencies mapped to this domain
    if (!dryRun) {
      const agencies = await listAgenciesForDomain(domain);
      if (!agencies.length) {
        console.log(`[db] no agencies with workspaceEmailDomain=${domain} (skip identity upsert)`);
      }
      for (const a of agencies) {
        try {
          const mb = await ensureTenantMessageMailboxes(a.id, domain);
          console.log(`[db] agency ${a.id} (${a.slug || a.name}): messages=${mb.messages?.from_email}`);
        } catch (e) {
          console.warn(`[db] agency ${a.id}:`, e?.message || e);
        }
      }
    }
  }

  console.log('\nDone.');
  console.log(JSON.stringify({ count: results.length, results }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
