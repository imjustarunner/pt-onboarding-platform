// Preview by default. --apply mirrors app permissions into configured department
// Google Groups; it never enrolls unrelated staff, school, or personal login Groups.
import pool from '../config/database.js';
import { DEPARTMENTAL_GROUPS } from '../services/departmentalGroupPolicy.js';
import { reconcileManagedWorkspaceGroups } from '../services/managedWorkspaceGroups.service.js';
import { withMessagingJobLock } from '../services/messagingJobLock.service.js';

const apply = process.argv.includes('--apply');
const selected = process.argv.find(arg => arg.startsWith('--agency='))?.slice('--agency='.length);
try {
  const agencyIds = selected ? selected.split(',').map(Number) : null;
  if (agencyIds?.some(id => !Number.isInteger(id) || id <= 0)) throw new Error('--agency must contain positive agency IDs');
  const work = () => reconcileManagedWorkspaceGroups({ apply, agencyIds, enrolledOnly: true, groupKeys: Object.keys(DEPARTMENTAL_GROUPS) });
  const reports = apply ? await withMessagingJobLock('staff-membership', work, { timeoutSeconds: 30 }) : await work();
  console.log(JSON.stringify({ apply, reports: Array.isArray(reports) ? reports.map(r => ({
    agencyId: r.agencyId, domain: r.domain, missingMailbox: r.missingMailbox, error: r.error,
    groups: r.groups.map(g => ({ groupKey: g.groupKey, email: g.email, subscription: g.subscription,
      created: g.created, added: g.added.length, removed: g.removed.length, preserved: g.preserved.length,
      sender: g.sender || null, error: g.error }))
  })) : reports }, null, 2));
  if (Array.isArray(reports) && reports.some(r => r.error || r.groups.some(g => g.error))) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await pool.end(); }
