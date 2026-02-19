import User from '../models/User.model.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import {
  listBillingPolicyProfiles,
  getBillingPolicyProfileById,
  createBillingPolicyProfile,
  updateBillingPolicyProfile,
  publishBillingPolicyProfile,
  listPolicyServiceRules,
  upsertPolicyServiceRule,
  upsertPolicyEligibilityRule,
  addPolicyRuleSource,
  getAgencyPolicyActivation,
  setAgencyPolicyActivation,
  listAgencyServiceCodeActivation,
  setAgencyServiceCodeActivation,
  resolvePolicyProfileForAgency,
  resolvePolicyRuleForServiceCode,
  createIngestionJobFromUpload,
  listIngestionJobs,
  getIngestionJobDetail,
  reviewIngestionCandidate,
  publishApprovedIngestionJob,
  deleteIngestionJob
} from '../services/billingPolicy.service.js';

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'support', 'staff']);

function isPolicyAdmin(role) {
  return ADMIN_ROLES.has(String(role || '').toLowerCase());
}

async function userHasAgencyAccess({ userId, role, agencyId }) {
  if (String(role || '').toLowerCase() === 'super_admin') return true;
  const agencies = await User.getAgencies(userId);
  return (agencies || []).some((a) => Number(a.id) === Number(agencyId));
}

async function requirePolicyAdmin(req, res) {
  if (!isPolicyAdmin(req.user?.role)) {
    res.status(403).json({ error: { message: 'Access denied' } });
    return false;
  }
  return true;
}

async function requireAgencyAccess(req, res, agencyId) {
  if (!Number(agencyId)) {
    res.status(400).json({ error: { message: 'agencyId is required' } });
    return false;
  }
  if (!isPolicyAdmin(req.user?.role)) {
    res.status(403).json({ error: { message: 'Access denied' } });
    return false;
  }
  const allowed = await userHasAgencyAccess({
    userId: req.user.id,
    role: req.user.role,
    agencyId
  });
  if (!allowed) {
    res.status(403).json({ error: { message: 'Access denied for agency' } });
    return false;
  }
  return true;
}

async function auditLog(req, actionType, agencyId, metadata = {}) {
  try {
    if (!req.user?.id || !agencyId) return;
    await AdminAuditLog.logAction({
      actionType,
      actorUserId: req.user.id,
      targetUserId: req.user.id,
      agencyId,
      metadata
    });
  } catch (e) {
    // Best effort only.
    console.error('[billing-policy] audit log write failed:', e?.message || e);
  }
}

export const getPolicyProfiles = async (req, res, next) => {
  try {
    if (!(await requirePolicyAdmin(req, res))) return;
    const stateCode = String(req.query?.stateCode || '').trim() || null;
    const status = String(req.query?.status || '').trim() || null;
    const profiles = await listBillingPolicyProfiles({ stateCode, status });
    return res.json({ ok: true, profiles });
  } catch (e) {
    next(e);
  }
};

export const postPolicyProfile = async (req, res, next) => {
  try {
    if (!(await requirePolicyAdmin(req, res))) return;
    const created = await createBillingPolicyProfile({
      stateCode: req.body?.stateCode || 'CO',
      policyName: req.body?.policyName,
      versionLabel: req.body?.versionLabel,
      effectiveStartDate: req.body?.effectiveStartDate || null,
      effectiveEndDate: req.body?.effectiveEndDate || null,
      status: req.body?.status || 'DRAFT',
      notes: req.body?.notes || null,
      createdByUserId: req.user.id
    });
    return res.status(201).json({ ok: true, profile: created });
  } catch (e) {
    next(e);
  }
};

export const patchPolicyProfile = async (req, res, next) => {
  try {
    if (!(await requirePolicyAdmin(req, res))) return;
    const profileId = Number(req.params.profileId || 0);
    if (!profileId) return res.status(400).json({ error: { message: 'profileId is required' } });
    const updated = await updateBillingPolicyProfile(profileId, req.body || {});
    if (!updated) return res.status(404).json({ error: { message: 'Policy profile not found' } });
    return res.json({ ok: true, profile: updated });
  } catch (e) {
    next(e);
  }
};

export const publishPolicyProfileController = async (req, res, next) => {
  try {
    if (!(await requirePolicyAdmin(req, res))) return;
    const profileId = Number(req.params.profileId || 0);
    if (!profileId) return res.status(400).json({ error: { message: 'profileId is required' } });
    const published = await publishBillingPolicyProfile({ profileId, publishedByUserId: req.user.id });
    if (!published) return res.status(404).json({ error: { message: 'Policy profile not found' } });
    const auditAgencyId = Number(req.body?.agencyId || req.query?.agencyId || 0) || null;
    if (auditAgencyId) {
      await auditLog(req, 'BILLING_POLICY_PROFILE_PUBLISHED', auditAgencyId, { profileId });
    }
    return res.json({ ok: true, profile: published });
  } catch (e) {
    next(e);
  }
};

export const getPolicyProfileRules = async (req, res, next) => {
  try {
    if (!(await requirePolicyAdmin(req, res))) return;
    const profileId = Number(req.params.profileId || 0);
    if (!profileId) return res.status(400).json({ error: { message: 'profileId is required' } });
    const [profile, rules] = await Promise.all([
      getBillingPolicyProfileById(profileId),
      listPolicyServiceRules({ profileId })
    ]);
    if (!profile) return res.status(404).json({ error: { message: 'Policy profile not found' } });
    return res.json({ ok: true, profile, rules });
  } catch (e) {
    next(e);
  }
};

export const postPolicyProfileRule = async (req, res, next) => {
  try {
    if (!(await requirePolicyAdmin(req, res))) return;
    const profileId = Number(req.params.profileId || 0);
    if (!profileId) return res.status(400).json({ error: { message: 'profileId is required' } });
    const rule = await upsertPolicyServiceRule({
      profileId,
      serviceCode: req.body?.serviceCode,
      serviceDescription: req.body?.serviceDescription || null,
      minMinutes: req.body?.minMinutes ?? null,
      maxMinutes: req.body?.maxMinutes ?? null,
      unitMinutes: req.body?.unitMinutes ?? null,
      unitCalcMode: req.body?.unitCalcMode || 'NONE',
      maxUnitsPerDay: req.body?.maxUnitsPerDay ?? null,
      placeOfService: req.body?.placeOfService || null,
      providerTypeNotes: req.body?.providerTypeNotes || null,
      metadataJson: req.body?.metadataJson || null,
      createdByUserId: req.user.id
    });
    const auditAgencyId = Number(req.body?.agencyId || req.query?.agencyId || 0) || null;
    if (auditAgencyId) {
      await auditLog(req, 'BILLING_POLICY_RULE_UPSERTED', auditAgencyId, {
        profileId,
        serviceCode: rule?.service_code || req.body?.serviceCode || null
      });
    }
    return res.status(201).json({ ok: true, rule });
  } catch (e) {
    next(e);
  }
};

export const postPolicyRuleEligibility = async (req, res, next) => {
  try {
    if (!(await requirePolicyAdmin(req, res))) return;
    const serviceRuleId = Number(req.params.serviceRuleId || 0);
    if (!serviceRuleId) return res.status(400).json({ error: { message: 'serviceRuleId is required' } });
    const rows = await upsertPolicyEligibilityRule({
      serviceRuleId,
      credentialTier: req.body?.credentialTier || null,
      providerType: req.body?.providerType || null,
      allowed: req.body?.allowed !== false,
      minMinutesOverride: req.body?.minMinutesOverride ?? null,
      notes: req.body?.notes || null,
      metadataJson: req.body?.metadataJson || null,
      createdByUserId: req.user.id
    });
    return res.status(201).json({ ok: true, eligibility: rows });
  } catch (e) {
    next(e);
  }
};

export const postPolicyRuleSource = async (req, res, next) => {
  try {
    if (!(await requirePolicyAdmin(req, res))) return;
    const serviceRuleId = Number(req.params.serviceRuleId || 0);
    const profileId = Number(req.body?.profileId || 0);
    if (!profileId) return res.status(400).json({ error: { message: 'profileId is required' } });
    const source = await addPolicyRuleSource({
      profileId,
      serviceRuleId: serviceRuleId || null,
      sourceStoragePath: req.body?.sourceStoragePath || null,
      sourceFileName: req.body?.sourceFileName || null,
      pageNumber: req.body?.pageNumber ?? null,
      citationSnippet: req.body?.citationSnippet || null,
      metadataJson: req.body?.metadataJson || null,
      createdByUserId: req.user.id
    });
    return res.status(201).json({ ok: true, source });
  } catch (e) {
    next(e);
  }
};

export const getAgencyPolicyActivationController = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    if (!(await requireAgencyAccess(req, res, agencyId))) return;
    const activation = await getAgencyPolicyActivation({ agencyId });
    const profile = await resolvePolicyProfileForAgency({ agencyId });
    const serviceCodeActivation = await listAgencyServiceCodeActivation({ agencyId });
    return res.json({ ok: true, agencyId, activation, effectiveProfile: profile, serviceCodeActivation });
  } catch (e) {
    next(e);
  }
};

export const putAgencyPolicyActivationController = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    if (!(await requireAgencyAccess(req, res, agencyId))) return;
    const profileId = Number(req.body?.profileId || 0);
    if (!profileId) return res.status(400).json({ error: { message: 'profileId is required' } });
    const activation = await setAgencyPolicyActivation({
      agencyId,
      profileId,
      activatedByUserId: req.user.id
    });
    await auditLog(req, 'BILLING_POLICY_ACTIVATED', agencyId, {
      profileId,
      activationId: activation?.id || null
    });
    return res.json({ ok: true, activation });
  } catch (e) {
    next(e);
  }
};

export const getAgencyServiceCodeActivationController = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    if (!(await requireAgencyAccess(req, res, agencyId))) return;
    const rows = await listAgencyServiceCodeActivation({ agencyId });
    return res.json({ ok: true, agencyId, serviceCodeActivation: rows });
  } catch (e) {
    next(e);
  }
};

export const putAgencyServiceCodeActivationController = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    if (!(await requireAgencyAccess(req, res, agencyId))) return;
    const serviceCode = String(req.params.serviceCode || req.body?.serviceCode || '').trim().toUpperCase();
    if (!serviceCode) return res.status(400).json({ error: { message: 'serviceCode is required' } });
    const isEnabled = req.body?.isEnabled !== false;
    const row = await setAgencyServiceCodeActivation({
      agencyId,
      serviceCode,
      isEnabled,
      updatedByUserId: req.user.id
    });
    await auditLog(req, 'BILLING_POLICY_SERVICE_CODE_ACTIVATION_UPDATED', agencyId, {
      serviceCode,
      isEnabled
    });
    return res.json({ ok: true, row });
  } catch (e) {
    next(e);
  }
};

export const getResolvedRuleForAgencyAndCodeController = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    if (!(await requireAgencyAccess(req, res, agencyId))) return;
    const serviceCode = String(req.params.serviceCode || '').trim().toUpperCase();
    if (!serviceCode) return res.status(400).json({ error: { message: 'serviceCode is required' } });
    const credentialTier = String(req.query?.credentialTier || req.body?.credentialTier || '').trim().toLowerCase() || null;
    const rule = await resolvePolicyRuleForServiceCode({ agencyId, serviceCode, credentialTier });
    return res.json({ ok: true, agencyId, serviceCode, credentialTier, rule });
  } catch (e) {
    next(e);
  }
};

export const postPolicyIngestionUploadController = async (req, res, next) => {
  try {
    if (!(await requirePolicyAdmin(req, res))) return;
    const profileId = Number(req.params.profileId || req.body?.profileId || 0);
    if (!profileId) return res.status(400).json({ error: { message: 'profileId is required' } });
    if (!req.file) return res.status(400).json({ error: { message: 'file is required' } });
    const job = await createIngestionJobFromUpload({
      profileId,
      stateCode: req.body?.stateCode || 'CO',
      fileBuffer: req.file.buffer,
      originalName: req.file.originalname || null,
      mimeType: req.file.mimetype || 'application/pdf',
      createdByUserId: req.user.id
    });
    const auditAgencyId = Number(req.body?.agencyId || req.query?.agencyId || 0) || null;
    if (auditAgencyId) {
      await auditLog(req, 'BILLING_POLICY_INGESTION_UPLOADED', auditAgencyId, {
        profileId,
        ingestionJobId: Number(job?.id || 0) || null
      });
    }
    return res.status(201).json({ ok: true, job });
  } catch (e) {
    next(e);
  }
};

export const getPolicyIngestionJobsController = async (req, res, next) => {
  try {
    if (!(await requirePolicyAdmin(req, res))) return;
    const profileId = Number(req.query?.profileId || 0) || null;
    const jobs = await listIngestionJobs({ profileId });
    return res.json({ ok: true, jobs });
  } catch (e) {
    next(e);
  }
};

export const getPolicyIngestionJobDetailController = async (req, res, next) => {
  try {
    if (!(await requirePolicyAdmin(req, res))) return;
    const jobId = Number(req.params.jobId || 0);
    if (!jobId) return res.status(400).json({ error: { message: 'jobId is required' } });
    const detail = await getIngestionJobDetail(jobId);
    if (!detail) return res.status(404).json({ error: { message: 'Ingestion job not found' } });
    return res.json({ ok: true, job: detail });
  } catch (e) {
    next(e);
  }
};

export const postPolicyIngestionCandidateReviewController = async (req, res, next) => {
  try {
    if (!(await requirePolicyAdmin(req, res))) return;
    const candidateId = Number(req.params.candidateId || 0);
    if (!candidateId) return res.status(400).json({ error: { message: 'candidateId is required' } });
    const updated = await reviewIngestionCandidate({
      candidateId,
      status: req.body?.status,
      serviceDescription: req.body?.serviceDescription,
      minMinutes: req.body?.minMinutes,
      maxMinutes: req.body?.maxMinutes,
      unitMinutes: req.body?.unitMinutes,
      unitCalcMode: req.body?.unitCalcMode,
      maxUnitsPerDay: req.body?.maxUnitsPerDay,
      credentialTier: req.body?.credentialTier,
      providerType: req.body?.providerType,
      reviewNotes: req.body?.reviewNotes,
      reviewedByUserId: req.user.id
    });
    if (!updated) return res.status(404).json({ error: { message: 'Candidate not found' } });
    const auditAgencyId = Number(req.body?.agencyId || req.query?.agencyId || 0) || null;
    if (auditAgencyId) {
      await auditLog(req, 'BILLING_POLICY_CANDIDATE_REVIEWED', auditAgencyId, {
        candidateId,
        status: updated?.status || null,
        serviceCode: updated?.service_code || null
      });
    }
    return res.json({ ok: true, candidate: updated });
  } catch (e) {
    next(e);
  }
};

export const postPolicyIngestionPublishController = async (req, res, next) => {
  try {
    if (!(await requirePolicyAdmin(req, res))) return;
    const ingestionJobId = Number(req.params.jobId || 0);
    if (!ingestionJobId) return res.status(400).json({ error: { message: 'jobId is required' } });
    const detail = await publishApprovedIngestionJob({
      ingestionJobId,
      publishedByUserId: req.user.id
    });
    const profileId = Number(detail?.billing_policy_profile_id || 0) || null;
    const profile = profileId ? await getBillingPolicyProfileById(profileId) : null;
    const agencyId = Number(req.body?.agencyId || 0) || null;
    if (agencyId && profileId) {
      await setAgencyPolicyActivation({ agencyId, profileId, activatedByUserId: req.user.id });
      await auditLog(req, 'BILLING_POLICY_RULES_PUBLISHED', agencyId, {
        ingestionJobId,
        profileId
      });
    }
    return res.json({ ok: true, job: detail, profile });
  } catch (e) {
    next(e);
  }
};

export const deletePolicyIngestionJobController = async (req, res, next) => {
  try {
    if (!(await requirePolicyAdmin(req, res))) return;
    const jobId = Number(req.params.jobId || 0);
    if (!jobId) return res.status(400).json({ error: { message: 'jobId is required' } });
    const deleted = await deleteIngestionJob(jobId);
    if (!deleted) return res.status(404).json({ error: { message: 'Ingestion job not found' } });
    return res.json({ ok: true, deleted: true, jobId });
  } catch (e) {
    next(e);
  }
};
