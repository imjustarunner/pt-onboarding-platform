import pool from '../config/database.js';
import { readClientInsurance } from '../services/clientInsurance.service.js';
import { hasMedicaidCoverage, policyIsMedicaid } from '../utils/insurancePaymentPolicy.js';
import { estimateMoney } from '../services/costEstimatePolicy.js';
import Client from '../models/Client.model.js';
import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';
import { clientCareBillingSummary } from '../services/clientCareBillingSummary.service.js';
import { logClientAccess } from '../services/clientAccessLog.service.js';
import { clientCoverageAdmission } from '../services/clientCoverageAdmission.service.js';
import { hasSchedulingBillingAccess } from '../services/schedulingBillingAccess.service.js';
export async function getClientCoverageAdmission(req,res,next){try{
 const client=await Client.findById(req.params.id);
 if(!client)return res.status(404).json({error:{message:'Client not found'}});
 const role=String(req.user.role||'').toLowerCase();
 if(['school_staff','guardian','client_guardian','client'].includes(role))return res.status(403).json({error:{message:'Agency care-team access required'}});
 const access=await resolveClientRecordAccess({userId:req.user.id,role,clientId:client.id,client});
 if(!access.ok)return res.status(access.status).json({error:{message:access.message}});
 res.set('Cache-Control','no-store').json({...await clientCoverageAdmission(client.id,{client}),canVerify:await hasSchedulingBillingAccess(req.user,client.agency_id)});
}catch(e){next(e);}}
export async function getClientCareBillingSummary(req,res,next){try{
 const client=await Client.findById(req.params.id);
 if(!client) return res.status(404).json({error:{message:'Client not found'}});
 const role=String(req.user.role||'').toLowerCase();
 if(['school_staff','guardian','client_guardian','client'].includes(role))return res.status(403).json({error:{message:'Agency care-team access required'}});
 const access=await resolveClientRecordAccess({userId:req.user.id,role,clientId:client.id,client});
 if(!access.ok)return res.status(access.status).json({error:{message:access.message}});
 const result=await clientCareBillingSummary(client.agency_id,client.id,undefined,{includeVerification:req.query?.includeVerification==='1'});
 await logClientAccess(req,client.id,'view_care_coverage_status');
 res.set('Cache-Control','no-store').json(result);
}catch(e){next(e);}}

const afterHoursModes = new Set(['off', 'weekend_self_pay', 'after_insurance_denial']);
const afterHoursRoles = new Set(['admin', 'super_admin', 'provider', 'provider_plus', 'intern', 'intern_plus']);
const defaultAfterHoursAmountCents = 1500;
const afterHoursError = (status, message) => Object.assign(new Error(message), { status });

async function afterHoursAccess(req) {
  const role = String(req.user.role || '').toLowerCase();
  if (!afterHoursRoles.has(role)) throw afterHoursError(403, 'Assigned clinician or agency billing access is required.');
  const client = await Client.findById(req.params.id);
  if (!client || String(client.status).toUpperCase() === 'ARCHIVED') throw afterHoursError(404, 'Client not found.');
  if (Number(req.query.agencyId) !== Number(client.agency_id)) throw afterHoursError(403, 'Open this client in their chart’s agency.');
  const access = await resolveClientRecordAccess({ userId: req.user.id, role, client });
  if (!access.ok || (!access.isAssignedClinician && !(await hasSchedulingBillingAccess(req.user, client.agency_id)))) {
    throw afterHoursError(403, 'Assigned clinician or agency billing access is required.');
  }
  return client;
}

async function afterHoursCoverage(client) {
  const coverage = await readClientInsurance(client.id, client.agency_id);
  const payerLabel = client.primary_insurer_name || client.insurance_type_label;
  if (hasMedicaidCoverage(coverage) || policyIsMedicaid({ insurerName: payerLabel })) {
    return { eligible: false, reason: 'Weekend self-pay requests are unavailable for Medicaid clients.' };
  }
  if (!coverage?.primary?.insurerName && !payerLabel) {
    return { eligible: false, reason: 'Confirm the client’s insurance or self-pay status before submitting a request.' };
  }
  return { eligible: true, reason: null };
}

function afterHoursPreference(row) {
  return {
    mode: row?.request_mode || 'off',
    amountCents: row?.proposed_amount_cents ?? defaultAfterHoursAmountCents,
    requestedAt: row?.created_at || null
  };
}

export async function getClientAfterHoursSelfPay(req, res, next) {
  try {
    const client = await afterHoursAccess(req);
    const [coverage, [[row]]] = await Promise.all([
      afterHoursCoverage(client),
      pool.execute(`SELECT request_mode, proposed_amount_cents, created_at
        FROM client_after_hours_self_pay_requests WHERE agency_id = ? AND client_id = ?
        ORDER BY id DESC LIMIT 1`, [client.agency_id, client.id])
    ]);
    res.set('Cache-Control', 'no-store').json({ ...coverage, ...afterHoursPreference(row) });
  } catch (error) { next(error); }
}

export async function saveClientAfterHoursSelfPay(req, res, next) {
  try {
    const client = await afterHoursAccess(req);
    const mode = req.body?.mode;
    if (!afterHoursModes.has(mode)) throw afterHoursError(400, 'Choose a weekend billing preference.');
    const enabled = mode !== 'off';
    const coverage = await afterHoursCoverage(client);
    if (enabled && !coverage.eligible) throw afterHoursError(409, coverage.reason);
    let amount = null;
    if (enabled) {
      amount = estimateMoney(req.body?.amountCents ?? defaultAfterHoursAmountCents);
      if (amount < 1 || req.body?.attested !== true) {
        throw afterHoursError(400, 'Enter the proposed amount and confirm the client understood when it could apply.');
      }
    }
    await pool.execute(`INSERT INTO client_after_hours_self_pay_requests (
      agency_id, client_id, request_mode, proposed_amount_cents, provider_attested_at, requested_by_user_id
    ) VALUES (?, ?, ?, ?, IF(?, UTC_TIMESTAMP(), NULL), ?)`,
    [client.agency_id, client.id, mode, amount, enabled, req.user.id]);
    res.set('Cache-Control', 'no-store').json({ ...coverage, mode, amountCents: amount ?? defaultAfterHoursAmountCents });
  } catch (error) { next(error); }
}
