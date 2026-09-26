import 'dotenv/config';
import {syncRemittances,applyResponsibilityJobs} from '../services/remittances/store.js';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import Agency from '../models/Agency.model.js';
import { getMedicalBillingFlags } from '../services/medicalBillingFlags.service.js';
import { resolveClaimMdConnection } from '../services/claimMdConnection.service.js';
import { syncClaimMdResponses } from '../services/claimMdWorkflow.service.js';

// Run as one scheduled Cloud Run Job. This downloads status only; it never submits claims.
const agencyIds = [...new Set(String(process.env.CLAIM_MD_AGENCY_IDS || '').split(',').map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
try {
  if (!agencyIds.length) throw new Error('CLAIM_MD_AGENCY_IDS is required');
  for (const agencyId of agencyIds) {
    try {
      const agency = await Agency.findById(agencyId);
      if (!agency || !getMedicalBillingFlags(agency).claimMdEnabled) continue;
      const connection = await resolveClaimMdConnection(agencyId);
      const result = await syncClaimMdResponses({ agencyId, connection });
      const eras=await syncRemittances({agencyId,maxDownloads:25});
      await applyResponsibilityJobs(agencyId);
      console.log(JSON.stringify({ agencyId, updated: result.updated, moreAvailable: result.moreAvailable,erasImported:eras.imported,moreEras:eras.moreAvailable }));
    } catch {
      // Do not write payer responses, credentials, or clinical content to job logs.
      console.error(JSON.stringify({ agencyId, error: 'Claim.MD synchronization failed; inspect the billing workspace.' }));
      process.exitCode = 1;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
} catch {
  console.error('Claim.MD synchronization is not configured.');
  process.exitCode = 1;
} finally {
  await clinicalPool.end();
  await pool.end();
}
