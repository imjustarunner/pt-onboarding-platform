import { reconcileSchoolGroupTicketIntakeForAgency } from '../services/unifiedEmail/reconcileSchoolGroupTicketIntake.service.js';

async function main() {
  const agencySlug = process.env.SCHOOL_GROUP_SYNC_AGENCY_SLUG || process.argv[2] || 'itsco';
  const dryRun =
    String(process.env.SCHOOL_GROUP_SYNC_DRY_RUN || '').toLowerCase() === 'true' ||
    process.argv.includes('--dry-run');

  const result = await reconcileSchoolGroupTicketIntakeForAgency({
    agencySlug,
    dryRun,
    profileLinks: [
      {
        schoolOrganizationId: 425,
        itscoEmail: 'grantbeacon@itsco.health',
        districtName: 'Denver Public Schools'
      }
    ]
  });

  console.log('[reconcileSchoolGroupTicketIntake] done');
  console.log(
    JSON.stringify(
      {
        agencyId: result.agencyId,
        schoolReplyEmail: result.schoolReplyEmail,
        dryRun: result.dryRun,
        profilesLinked: result.profilesLinked,
        schoolsScanned: result.schoolsScanned,
        groupsMissing: result.groupsMissing,
        membersAdded: result.membersAdded,
        membersAlreadyPresent: result.membersAlreadyPresent,
        memberErrors: result.memberErrors,
        inboundCount: result.inboundSync?.identity?.inboundCount ?? null,
        addedSample: (result.added || []).slice(0, 20),
        missingGroupsSample: (result.missingGroups || []).slice(0, 15),
        errors: (result.errors || []).slice(0, 15)
      },
      null,
      2
    )
  );

  process.exit(result.errors?.length && result.membersAdded === 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[reconcileSchoolGroupTicketIntake] error:', e?.message || e);
  process.exit(1);
});
