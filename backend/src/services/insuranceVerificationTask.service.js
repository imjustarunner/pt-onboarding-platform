import pool from '../config/database.js';
import Task from '../models/Task.model.js';

const parse = value => typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
const reasons = {
  missing_member_id: 'The insurance member ID is missing.',
  missing_identity: 'The subscriber or dependent identity is incomplete.',
  missing_payer: 'The eligibility payer has not been identified.',
  subscriber_not_found: 'The payer could not find the submitted subscriber/insured.',
  identity_mismatch: 'A payer response was found, but the enrolled identity or subscriber relationship needs reconciliation before billing.',
  eligibility_unresolved: 'The eligibility response needs billing review.',
  eligibility_error: 'The electronic eligibility inquiry did not complete successfully.'
};

export function insuranceIdentityIssue(insurance, slot = 'primary') {
  const policy = insurance?.[slot];
  if (!policy?.memberId) return 'missing_member_id';
  if (!policy.subscriberFirstName || !policy.subscriberLastName || !policy.subscriberDob || !['self','child','spouse','other'].includes(policy.relationshipToSubscriber)
      || (policy.relationshipToSubscriber !== 'self' && (!insurance.patient?.firstName || !insurance.patient?.lastName || !insurance.patient?.dateOfBirth))) return 'missing_identity';
  if (!(policy.eligibilityPayerId || policy.payerId)) return 'missing_payer';
  return null;
}

/** One open task per client, shared with the agency's configured billing team.
 * Repeated failures preserve ownership and work in progress. Never resolve a
 * task merely because a new insurance value was saved or one benefit is active. */
export async function queueInsuranceVerificationTask({agencyId,clientId,actorUserId,reason,coverageCheckId=null}, db=pool) {
  if (!reasons[reason]) return null;
  const [[agency]] = await db.execute('SELECT feature_flags FROM agencies WHERE id=?', [agencyId]);
  const config = parse(agency?.feature_flags).insuranceVerificationTasks;
  if (!config?.enabled || !Number(config.taskListId)) return null;
  const lock = await db.getConnection(), key = `insurance-task:${Number(agencyId)}:${Number(clientId)}`;
  let acquired = false;
  try {
    const [[got]] = await lock.execute('SELECT GET_LOCK(?,5) AS acquired', [key]);
    acquired = Number(got.acquired) === 1;
    if (!acquired) throw new Error('Insurance follow-up task is already being updated');
    const [[list]] = await db.execute('SELECT id FROM task_lists WHERE id=? AND agency_id=?', [config.taskListId,agencyId]);
    const [[client]] = await db.execute('SELECT id,initials FROM clients WHERE id=? AND agency_id=?', [clientId,agencyId]);
    if (!list || !client) throw new Error('Insurance follow-up task scope is invalid');
    const [[existing]] = await db.execute("SELECT id,status FROM tasks WHERE assigned_to_agency_id=? AND source_ref_type='insurance_verification' AND source_ref_id=? ORDER BY id DESC LIMIT 1", [agencyId,String(clientId)]);
    if (existing) {
      await db.execute(`UPDATE tasks SET metadata=JSON_SET(COALESCE(metadata,JSON_OBJECT()),'$.reason',?,'$.coverageCheckId',?),
        status=IF(status IN ('completed','overridden'),'pending',status), completed_at=NULL WHERE id=?`, [reason,coverageCheckId,existing.id]);
      return existing.id;
    }
    const task = await Task.create({taskType:'custom',title:`Verify insurance — ${client.initials || `client ${clientId}`}`,
      description:[reasons[reason],
        'A billing team member should take ownership of this task.',
        'Verify the member ID, enrolled legal name, date of birth, and subscriber relationship using the payer portal or information confirmed with the family. Do not guess missing identifiers.',
        'For Colorado Medicaid, confirm the child’s own coverage and RAE assignment; check other insurance/TPL and payer order.',
        'Update the client’s secure insurance record with the confirmed information and supporting reference. Rerun eligibility for the actual service date and document the result.',
        'Keep claim submission on hold until coverage, payer routing, provider enrollment and service requirements are verified. Complete this task only after documenting the resolution.',
        'The latest reason and electronic check reference are stored with this task. Do not put member IDs or full names in task comments.'
      ].join('\n'),encryptDescription:true,assignedToUserId:null,assignedToAgencyId:agencyId,
      assignedByUserId:actorUserId || config.ownerUserId,taskListId:list.id,urgency:'high',categories:['billing','client'],
      sourceRefType:'insurance_verification',sourceRefId:String(clientId),metadata:{clientId:Number(clientId),reason,coverageCheckId,insuranceVerification:true}});
    return task.id;
  } finally { if (acquired) await lock.execute('SELECT RELEASE_LOCK(?)',[key]);lock.release(); }
}

export async function queueInsuranceVerificationSafely(input, db=pool) {
  try { return await queueInsuranceVerificationTask(input,db); }
  catch (error) { console.warn('[insurance-verification] follow-up task pending', {agencyId:input.agencyId,clientId:input.clientId,message:error.message});return null; }
}
