// Idempotent recovery of billing records omitted by older signing paths.
// Dry-run by default. This command never signs a note or uploads a claim.
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import User from '../models/User.model.js';
import { hasSchedulingBillingAccess } from '../services/schedulingBillingAccess.service.js';
import { getEffectiveNote } from '../services/clinicalNoteVersion.service.js';
import { isNonBillableDocument } from '../services/supervisedBillingPolicy.service.js';
import { loadClinicalBillingApproval } from '../services/billingClinicalApproval.service.js';
import { createMedicalClaim } from '../controllers/medicalBilling.controller.js';
import { claimRecoveryFailure } from '../services/claimRecoveryResult.js';

const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
const positiveId = raw => Number.isSafeInteger(Number(raw)) && Number(raw) > 0 ? Number(raw) : null;
async function main() {
  const agencyId = positiveId(value('--agency')), actorId = positiveId(value('--actor'));
  if (!args.includes('--agency') || !args.includes('--actor') || !agencyId || !actorId) throw new Error('Use --agency ID --actor BILLING_USER_ID [--note-ids 1,2] [--apply].');
  const user = await User.findById(actorId);
  if (!user || !await hasSchedulingBillingAccess(user, agencyId)) throw new Error('The selected actor does not have billing access to this agency.');
  const ids = args.includes('--note-ids') ? String(value('--note-ids')).split(',').map(positiveId) : [];
  if (ids.some(id => !id) || ids.length > 500) throw new Error('Provide at most 500 valid note IDs.');
  const apply = args.includes('--apply');
  const [notes] = await clinicalPool.execute(`SELECT n.* FROM clinical_notes n WHERE n.agency_id=? AND n.is_deleted=0 AND n.provider_signed_at IS NOT NULL
    ${ids.length ? `AND n.id IN (${ids.map(() => '?').join(',')})` : ''}
    AND NOT EXISTS(SELECT 1 FROM clinical_claims c WHERE c.agency_id=n.agency_id AND c.clinical_session_id=n.clinical_session_id) ORDER BY n.id`, [agencyId,...ids]);
  const results = [];
  for (const source of notes) {
    try {
      const approval = await loadClinicalBillingApproval({ noteId: source.id, agencyId }, clinicalPool);
      if (!approval.approved) { results.push({noteId:Number(source.id),status:'not_approved',stage:approval.stage,code:'CLINICAL_APPROVAL_REQUIRED'}); continue; }
      const note = await getEffectiveNote({ note: source });
      if (isNonBillableDocument(note)) {
        results.push({noteId:Number(note.id),status:'not_approved'}); continue;
      }
      if (!apply) { results.push({noteId:Number(note.id),sessionId:Number(note.clinical_session_id),status:'would_create',clinicalRevisionId:note.clinical_version_id}); continue; }
      let status = 200, body;
      const res = { status(code) { status=code;return this; }, json(data) { body=data;return this; } };
      await createMedicalClaim({user,body:{agencyId,clientId:Number(note.client_id),clinicalSessionId:Number(note.clinical_session_id),clinicalNoteId:Number(note.id)}},res,error => {throw error;});
      results.push({noteId:Number(note.id),status:status>=400?'needs_billing_review':body?.alreadyExists?'already_exists':'created',httpStatus:status,claimId:body?.claim?.id || null,...(status>=400?claimRecoveryFailure(status,body):{})});
    } catch (error) { results.push({noteId:Number(source.id),status:'needs_billing_review',...claimRecoveryFailure(error.status,{},error)}); }
  }
  console.log(JSON.stringify({agencyId,actorId,apply,claimTransmitted:false,results},null,2));
  if (results.some(row => row.status==='needs_billing_review')) process.exitCode=2;
}
try { await main(); } catch(error) { console.error(error.message);process.exitCode=1; }
finally { await Promise.allSettled([pool.end(),clinicalPool.end()]); }
