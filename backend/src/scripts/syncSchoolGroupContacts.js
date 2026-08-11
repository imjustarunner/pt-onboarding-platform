import { syncSchoolGroupContactsForAgency } from '../services/unifiedEmail/schoolGroupContactsSync.service.js';

async function main() {
  const agencySlug = process.env.SCHOOL_GROUP_SYNC_AGENCY_SLUG || process.argv[2] || 'itsco';
  const agencyId = process.env.SCHOOL_GROUP_SYNC_AGENCY_ID
    ? Number(process.env.SCHOOL_GROUP_SYNC_AGENCY_ID)
    : null;
  const memberEmail = process.env.SCHOOL_GROUP_SYNC_MEMBER_EMAIL || process.argv[3] || 'schoolreply@itsco.health';
  const dryRun = String(process.env.SCHOOL_GROUP_SYNC_DRY_RUN || process.argv.includes('--dry-run')).toLowerCase() === 'true'
    || process.argv.includes('--dry-run');

  const result = await syncSchoolGroupContactsForAgency({
    agencyId: Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null,
    agencySlug,
    memberEmail,
    dryRun,
    alsoSyncInboundRoutes: !dryRun
  });

  console.log('[SchoolGroupContactsSync] done');
  console.log(JSON.stringify({
    agencyId: result.agencyId,
    memberEmail: result.memberEmail,
    dryRun: result.dryRun,
    groupsFound: result.groupsFound,
    groupsMatched: result.groupsMatched,
    groupsUnmatched: result.groupsUnmatched,
    membersScanned: result.membersScanned,
    contactsCreated: result.contactsCreated,
    contactsUpdated: result.contactsUpdated,
    contactsSkippedInternal: result.membersSkippedInternal,
    inboundSync: result.inboundSync,
    matchedSample: (result.matchedGroups || []).slice(0, 8),
    unmatchedSample: (result.unmatchedGroups || []).slice(0, 8),
    errors: (result.errors || []).slice(0, 10)
  }, null, 2));

  process.exit(0);
}

main().catch((e) => {
  console.error('[SchoolGroupContactsSync] error:', e?.message || e);
  process.exit(1);
});
