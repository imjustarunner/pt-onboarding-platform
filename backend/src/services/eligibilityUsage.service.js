import pool from '../config/database.js';
import {reserveMedicalServiceUsage,completeMedicalServiceUsage} from './medicalServiceFees.service.js';
import { billingError } from './familyBillingPolicy.service.js';
import { runCoverageCheck, coverageFingerprint, buildEligibilityRequest } from './coverageVerification.service.js';
import { readClientInsurance } from './clientInsurance.service.js';
import { requireClaimMdTransmission } from './claimMdConnection.service.js';

export function accountEligibilityLimit(connectionId, env=process.env) {
  let limits;
  try { limits=JSON.parse(env.CLAIM_MD_ELIGIBILITY_ACCOUNT_LIMITS_JSON || '{}'); }
  catch { throw billingError(503,'Eligibility account limits are invalid; contact an administrator'); }
  const limit=limits?.[connectionId];
  if(limit==null)return null;
  if(!Number.isSafeInteger(limit)||limit<0)throw billingError(503,'Eligibility account limits are invalid; contact an administrator');
  return limit;
}

export async function reserveEligibilityUsage(input, deps={}) {
  const db=await (deps.db||pool).getConnection();
  const month=(deps.now||new Date()).toISOString().slice(0,7);
  const accountLimit=accountEligibilityLimit(input.connectionId,deps.env||process.env);
  try {
    await db.beginTransaction();
    await db.execute('INSERT INTO claimmd_eligibility_usage_locks (connection_id,usage_month) VALUES (?,?) ON DUPLICATE KEY UPDATE connection_id=VALUES(connection_id)',[input.connectionId,month]);
    await db.execute('SELECT connection_id FROM claimmd_eligibility_usage_locks WHERE connection_id=? AND usage_month=? FOR UPDATE',[input.connectionId,month]);
    const [[policy]]=await db.execute('SELECT * FROM agency_eligibility_automation WHERE agency_id=? FOR UPDATE',[input.agencyId]);
    const [[previous]]=await db.execute('SELECT id,status FROM claimmd_eligibility_usage WHERE agency_id=? AND client_id=? AND request_key=?',[input.agencyId,input.clientId,input.requestKey]);
    if(previous)throw billingError(409,'This eligibility request is already recorded. Review its result before creating a new request');
    if(input.source==='automatic'&&(!policy?.enabled||!policy.monthly_limit||accountLimit==null))throw billingError(409,'Automatic eligibility is paused or its account limit is not configured');
    const [[usage]]=await db.execute("SELECT COUNT(*) AS account_used,COALESCE(SUM(agency_id=?),0) AS agency_used FROM claimmd_eligibility_usage WHERE connection_id=? AND usage_month=? AND status<>'not_sent'",[input.agencyId,input.connectionId,month]);
    if(accountLimit!=null&&Number(usage.account_used)>=accountLimit)throw billingError(409,'The shared Claim.MD account eligibility limit has been reached');
    // Agency usage includes every connection used this month, even after a key/account change.
    const [[agencyUsage]]=await db.execute("SELECT COUNT(*) AS used FROM claimmd_eligibility_usage WHERE agency_id=? AND usage_month=? AND status<>'not_sent'",[input.agencyId,month]);
    if(policy&&Number(agencyUsage.used)>=Number(policy.monthly_limit))throw billingError(409,'The agency monthly eligibility limit has been reached');
    const [r]=await db.execute('INSERT INTO claimmd_eligibility_usage (connection_id,usage_month,agency_id,client_id,request_key,source,created_by_user_id) VALUES (?,?,?,?,?,?,?)',[input.connectionId,month,input.agencyId,input.clientId,input.requestKey,input.source,input.actorUserId]);
    await db.commit();return r.insertId;
  } catch(e) {await db.rollback();throw e;} finally {db.release();}
}

/** Budget reserved before transmission. Unknown outcomes consume budget and are
 * never retried automatically. A returned response is not a coverage approval.
 */
export async function runMeteredCoverageCheck(input, deps={}) {
  const db=deps.db||pool,connection=input.connection;
  requireClaimMdTransmission(connection);
  const insurance=await (deps.readInsurance||readClientInsurance)(input.clientId,input.agencyId,db);
  buildEligibilityRequest({...input,insurance}); // Local failures must not reserve vendor usage.
  const fingerprint=coverageFingerprint(insurance);
  if(input.expectedFingerprint&&input.expectedFingerprint!==fingerprint)throw billingError(409,'Insurance changed; refresh the verification request');
  const reservation=await (deps.reserve||reserveEligibilityUsage)({...input,source:input.source||'manual',connectionId:connection.connectionId},deps);
  let checkStarted=false;
  try {
    const feeUsageId=await (deps.reserveFee||reserveMedicalServiceUsage)({agencyId:input.agencyId,kind:'eligibility',sourceId:reservation},deps);
    checkStarted=true;
    const result=await (deps.check||runCoverageCheck)({...input,accountKey:connection.accountKey,expectedFingerprint:fingerprint},deps);
    await db.execute("UPDATE claimmd_eligibility_usage SET status='returned',coverage_check_id=?,completed_at=CURRENT_TIMESTAMP(6) WHERE id=? AND agency_id=?",[result.id,reservation,input.agencyId]);
    await (deps.completeFee||completeMedicalServiceUsage)(feeUsageId,input.agencyId,db);
    return result;
  } catch(e) {
    // Only local validation failures establish that no request reached Claim.MD.
    await db.execute('UPDATE claimmd_eligibility_usage SET status=?,completed_at=CURRENT_TIMESTAMP(6) WHERE id=? AND agency_id=? AND status=\'reserved\'',[!checkStarted||e.status===400||e.status===409?'not_sent':'unknown',reservation,input.agencyId]);
    throw e;
  }
}
