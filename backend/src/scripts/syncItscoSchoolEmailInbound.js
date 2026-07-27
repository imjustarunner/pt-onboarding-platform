import { syncSchoolEmailInboundForAgency } from '../services/unifiedEmail/schoolEmailInboundSync.service.js';

async function main() {
  const agencySlug = process.env.SCHOOL_EMAIL_SYNC_AGENCY_SLUG || process.argv[2] || 'itsco';
  const agencyId = process.env.SCHOOL_EMAIL_SYNC_AGENCY_ID
    ? Number(process.env.SCHOOL_EMAIL_SYNC_AGENCY_ID)
    : null;

  const result = await syncSchoolEmailInboundForAgency({
    agencyId: Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null,
    agencySlug,
    fromEmail: process.env.SCHOOLREPLY_FROM_EMAIL || 'schoolreply@itsco.health',
    replyTo: process.env.SCHOOLREPLY_REPLY_TO || 'schools@itsco.health',
    configureAiPolicy: String(process.env.SCHOOL_EMAIL_SYNC_SKIP_POLICY || '').toLowerCase() !== '1'
  });

  console.log('[SchoolEmailInboundSync] done');
  console.log(JSON.stringify({
    agency: result.agency,
    identityId: result.identity.id,
    fromEmail: result.identity.fromEmail,
    replyTo: result.identity.replyTo,
    inboundCount: result.identity.inboundCount,
    schoolsRouted: result.schoolsRouted,
    missingGroupEmailCount: result.missingGroupEmailCount,
    cleanedOtherIdentities: result.cleanedOtherIdentities,
    aiPolicy: result.aiPolicy,
    sampleInbound: (result.identity.inboundAddresses || []).slice(0, 15),
    missingSample: (result.missingGroupEmails || []).slice(0, 10)
  }, null, 2));

  process.exit(0);
}

main().catch((e) => {
  console.error('[SchoolEmailInboundSync] error:', e);
  process.exit(1);
});
