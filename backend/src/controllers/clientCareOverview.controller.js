import pool from '../config/database.js';
import { readClientInsurance } from '../services/clientInsurance.service.js';
import { clientPaymentSetup } from '../services/clientPaymentSetup.service.js';
import { readCoverageVerificationSummary } from '../services/coverageVerificationSummary.service.js';
import { hasSchedulingBillingAccess } from '../services/schedulingBillingAccess.service.js';
import { clientSessionSnapshots } from '../services/clientSessionSnapshot.service.js';
import { getLatestDisclosureAcknowledgement } from '../services/smartDisclosure.service.js';
import { policyIsMedicaid } from '../utils/insurancePaymentPolicy.js';
import { logClientAccess } from '../services/clientAccessLog.service.js';
import {requireOverviewAccess} from './clientQuickView.controller.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import {loadEncounterTreatmentPlanEligibility} from '../services/treatmentPlanEncounterEligibility.service.js';
import {listClientDiagnosisAlerts} from '../services/clinicalDiagnosisPolicy.service.js';
import {loadClientFiscalSessions,recordFiscalBaseline} from '../services/clientFiscalSessions.service.js';
async function scope(req){
  const agencyId=Number(req.query.agencyId||req.body?.agencyId),clientId=Number(req.params.id);
  await requireOverviewAccess(req.user,clientId,agencyId);
  await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId,requireClinicalService:true});
  return {agencyId,clientId};
}
export async function clientCareOverview(req,res,next){
  try{const context=await scope(req);
    const results=await Promise.allSettled([loadEncounterTreatmentPlanEligibility({...context,dateOfService:new Date().toISOString().slice(0,10)}),listClientDiagnosisAlerts(context),loadClientFiscalSessions(context)]);
    res.set('Cache-Control','private, no-store').json({
      treatmentPlan:results[0].status==='fulfilled'?results[0].value:null,
      diagnosisAlerts:results[1].status==='fulfilled'?results[1].value:null,
      fiscalSessions:results[2].status==='fulfilled'?results[2].value:null,
      unavailable:results.some(r=>r.status==='rejected')});
  }catch(error){next(error);}
}
export async function saveClientFiscalBaseline(req,res,next){
  try{const context=await scope(req);await recordFiscalBaseline({...context,actorUserId:req.user.id,input:req.body||{}});
    res.set('Cache-Control','private, no-store').json(await loadClientFiscalSessions(context));
  }catch(error){next(error);}
}

export async function clientOverviewEssentials(req, res, next) {
  try {
    const agencyId = Number(req.query.agencyId);
    const clientId = Number(req.params.id);
    const context = { agencyId, clientId };
    await requireOverviewAccess(req.user, clientId, agencyId, { allowBilling: true });
    const [[agency]] = await pool.execute('SELECT timezone FROM agencies WHERE id = ?', [agencyId]);
    let timeZone = agency?.timezone || 'America/Denver';
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
    } catch {
      timeZone = 'America/Denver';
    }
    const { year, month, day } = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).map(part => [part.type, part.value]));
    const dateOfService = `${year}-${month}-${day}`;
    const [insurance, canBill, disclosure, intake, treatmentPlan, sessions] = await Promise.allSettled([
      readClientInsurance(clientId, agencyId),
      hasSchedulingBillingAccess(req.user, agencyId),
      getLatestDisclosureAcknowledgement(clientId, { agencyId }),
      pool.execute(`SELECT MAX(s.submitted_at) AS submitted_at
        FROM intake_submissions s
        JOIN intake_links l ON l.id = s.intake_link_id AND l.organization_id = ?
        WHERE s.submitted_at IS NOT NULL AND (s.client_id = ? OR EXISTS (
          SELECT 1 FROM intake_submission_clients isc WHERE isc.intake_submission_id = s.id AND isc.client_id = ?
        ))`, [agencyId, clientId, clientId]),
      loadEncounterTreatmentPlanEligibility({ ...context, dateOfService }),
      clientSessionSnapshots(agencyId, [clientId])
    ]);
    const policies = insurance.status === 'fulfilled' ? ['primary', 'secondary'].flatMap(slot => {
      const policy = insurance.value?.[slot];
      if (!policy?.insurerName) return [];
      const programType = ['commercial', 'medicaid', 'tricare', 'medicare'].includes(policy.programType)
        ? policy.programType : policyIsMedicaid(policy) ? 'medicaid' : null;
      return [{ slot, insurerName: policy.insurerName, programType }];
    }) : null;
    let billing = null;
    if (canBill.value) {
      const [verification, payment] = await Promise.allSettled([
        insurance.status === 'fulfilled' && policies.length ? readCoverageVerificationSummary(context, insurance.value) : null,
        clientPaymentSetup(agencyId, clientId)
      ]);
      billing = {
        verification: verification.value ? { current: verification.value.current, verifiedAt: verification.value.verifiedAt } : null,
        verificationUnavailable: insurance.status === 'rejected' || verification.status === 'rejected',
        payment: payment.value ? { cardOnFile: payment.value.summary.cardOnFile, medicaid: payment.value.summary.medicaid } : null
      };
    }
    const acknowledgement = disclosure.value;
    const plan = treatmentPlan.value;
    const sessionDates = sessions.value?.[0];
    await logClientAccess(req, clientId, 'view_client_overview_essentials');
    res.set('Cache-Control', 'private, no-store').json({
      timeZone, policies, billing,
      disclosure: acknowledgement?.signed_at ? {
        signedAt: acknowledgement.signed_at,
        includesViewer: Array.isArray(acknowledgement.providers) && acknowledgement.providers.length
          ? acknowledgement.providers.some(provider => Number(provider.id || provider.userId) === Number(req.user.id)) : null
      } : null,
      intakeAt: intake.value?.[0]?.[0]?.submitted_at ?? null,
      intakeUnavailable: intake.status === 'rejected',
      treatmentPlan: plan ? { date: plan.planDate || null, ageDays: plan.ageDays, current: plan.eligible } : null,
      today: dateOfService,
      sessions: sessionDates ? { lastAt: sessionDates.lastCompletedAt || sessionDates.lastAt, nextAt: sessionDates.nextAt, unavailable: sessionDates.unavailable } : null
    });
  } catch (error) {
    next(error);
  }
}

export async function clientChartAppointments(req, res, next) {
  try {
    const agencyId = Number(req.query.agencyId);
    const clientId = Number(req.params.id);
    await requireOverviewAccess(req.user, clientId, agencyId);
    if (req.user.role !== 'super_admin') {
      const [[membership]] = await pool.execute('SELECT 1 FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1', [req.user.id, agencyId]);
      if (!membership) throw Object.assign(new Error('Agency access required.'), { status: 403 });
    }
    const date = new Date();
    const page = Math.min(200, Math.max(0, Number.parseInt(req.query.historyPage, 10) || 0));
    const select = `SELECT a.id, a.start_at, a.end_at, a.source_timezone, a.status, a.modality,
      u.first_name, u.last_name FROM appointments a LEFT JOIN users u ON u.id=a.provider_user_id
      WHERE a.agency_id=? AND EXISTS (
        SELECT 1 FROM appointment_participants p WHERE p.appointment_id=a.id AND p.client_id=? AND p.role IN ('client','student')
      )`;
    const [[upcoming], [history]] = await Promise.all([
      pool.execute(`${select} AND a.start_at>=? AND a.status IN ('scheduled','confirmed','client_confirmed','in_progress')
        ORDER BY a.start_at, a.id LIMIT 12`, [agencyId, clientId, date]),
      pool.execute(`${select} AND a.start_at<? AND a.status<>'voided' ORDER BY a.start_at DESC, a.id DESC LIMIT 13 OFFSET ${page * 12}`, [agencyId, clientId, date])
    ]);
    res.set('Cache-Control', 'private, no-store').json({ upcoming, history: history.slice(0,12), moreHistory: history.length > 12 });
  } catch (error) {
    next(error);
  }
}
