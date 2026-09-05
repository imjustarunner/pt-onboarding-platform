import EmailService from '../services/email.service.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import {
  getPlatformEmailSettings,
  setPlatformEmailSettings,
  listAgencyEmailSettings,
  normalizeEmailSendingMode,
  normalizeEmailAiPolicyMode,
  normalizeEmailAiIntentClasses,
  normalizeEmailAiConfidenceThreshold,
  normalizeSenderIdentityKeys,
  normalizeTemplateSenderIdentityJson,
  listSchoolEmailAiPolicyOverrides,
  upsertSchoolEmailAiPolicyOverride,
  removeSchoolEmailAiPolicyOverride
} from '../services/emailSettings.service.js';

function isParentAgencyOrg(org) {
  const type = String(org?.organization_type || '').trim().toLowerCase();
  return !['school', 'program', 'learning', 'clinical'].includes(type);
}

export const getEmailSettings = async (req, res, next) => {
  try {
    const platform = await getPlatformEmailSettings();
    const configured = EmailService.isConfigured();

    const userRole = req.user?.role || 'staff';
    let agencies = [];
    if (userRole === 'super_admin') {
      agencies = await Agency.findAll(false, false);
    } else {
      agencies = await User.getAgencies(req.user.id);
    }
    agencies = (agencies || []).filter(isParentAgencyOrg);

    const agencyIds = (agencies || []).map((a) => Number(a.id)).filter(Boolean);
    const agencySettings = await listAgencyEmailSettings(agencyIds);
    const byAgencyId = new Map(agencySettings.map((s) => [Number(s.agencyId), s]));

    const agenciesPayload = (agencies || []).map((a) => {
      const setting = byAgencyId.get(Number(a.id)) || { notificationsEnabled: true };
      const effectiveEnabled = platform.notificationsEnabled && setting.notificationsEnabled;
      return {
        agencyId: Number(a.id),
        name: a.name,
        notificationsEnabled: setting.notificationsEnabled !== false,
        aiDraftPolicyMode: setting.aiDraftPolicyMode || 'human_only',
        allowSchoolOverrides: setting.allowSchoolOverrides !== false,
        aiAllowedIntentClasses: setting.aiAllowedIntentClasses || ['school_status_request'],
        aiMatchConfidenceThreshold: setting.aiMatchConfidenceThreshold ?? 0.75,
        aiAllowedSenderIdentityKeys: setting.aiAllowedSenderIdentityKeys || [],
        schoolRoiEmailsRequireApproval: setting.schoolRoiEmailsRequireApproval !== false,
        defaultSenderIdentityId: setting.defaultSenderIdentityId || null,
        templateSenderIdentityIds: setting.templateSenderIdentityIds || {},
        personalEmailDigestEnabled: setting.personalEmailDigestEnabled !== false,
        personalEmailDigestBusinessHours: setting.personalEmailDigestBusinessHours ?? 24,
        holdStaffSchoolOutsideAvailability: setting.holdStaffSchoolOutsideAvailability !== false,
        clientOooAutoReplyEnabled: setting.clientOooAutoReplyEnabled !== false,
        clientOooTemplate: setting.clientOooTemplate || null,
        clientOooSupportKeyword: setting.clientOooSupportKeyword || 'SUPPORT',
        unknownSenderBoxEnabled: setting.unknownSenderBoxEnabled !== false,
        secureMessageSenderIdentityId: setting.secureMessageSenderIdentityId || null,
        noreplySenderIdentityId: setting.noreplySenderIdentityId || null,
        intentReviewEnabled: setting.intentReviewEnabled !== false,
        intentConfidenceThreshold: setting.intentConfidenceThreshold ?? 0.75,
        quickViewEnabled: !!setting.quickViewEnabled,
        secureClientMessageEmailEnabled: !!setting.secureClientMessageEmailEnabled,
        htmlEmailHeaderUrl: setting.htmlEmailHeaderUrl || null,
        htmlEmailFooterUrl: setting.htmlEmailFooterUrl || null,
        htmlEmailChromeComplete: !!(setting.htmlEmailHeaderUrl && setting.htmlEmailFooterUrl),
        effectiveNotificationsEnabled: effectiveEnabled
      };
    });

    const overridesByAgency = {};
    for (const a of agenciesPayload) {
      try {
        overridesByAgency[String(a.agencyId)] = await listSchoolEmailAiPolicyOverrides(a.agencyId);
      } catch {
        overridesByAgency[String(a.agencyId)] = [];
      }
    }

    let htmlEmailChromeMeta = null;
    try {
      const { resolveTenantEmailChrome } = await import('../services/tenantEmailChrome.service.js');
      const focusAgencyId = Number(req.query?.agencyId || agenciesPayload[0]?.agencyId || 0);
      htmlEmailChromeMeta = await resolveTenantEmailChrome(focusAgencyId || 0);
    } catch {
      htmlEmailChromeMeta = null;
    }

    res.json({
      platform: {
        sendingMode: platform.sendingMode,
        notificationsEnabled: platform.notificationsEnabled
      },
      configured,
      fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
      fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || null,
      impersonateUser: process.env.GMAIL_IMPERSONATE_USER || process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER || null,
      agencies: agenciesPayload,
      schoolOverridesByAgency: overridesByAgency,
      htmlEmailChrome: htmlEmailChromeMeta
    });
  } catch (error) {
    next(error);
  }
};

export const updateEmailSettings = async (req, res, next) => {
  try {
    const { platform, agencies } = req.body || {};
    const userRole = req.user?.role || 'staff';
    if (!['admin', 'super_admin', 'staff', 'support'].includes(userRole)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    let updatedPlatform = null;
    if (platform && userRole === 'super_admin') {
      const normalized = normalizeEmailSendingMode(platform.sendingMode);
      if (!['all', 'manual_only'].includes(normalized)) {
        return res.status(400).json({ error: { message: 'sendingMode must be "all" or "manual_only"' } });
      }
      updatedPlatform = await setPlatformEmailSettings({
        sendingMode: normalized,
        notificationsEnabled: platform.notificationsEnabled !== false,
        actorUserId: req.user.id
      });
    }

    if (Array.isArray(agencies) && agencies.length) {
      const allowedAgencyIds = userRole === 'super_admin'
        ? agencies.map((a) => Number(a.agencyId))
        : (await User.getAgencies(req.user.id)).map((a) => Number(a.id));

      const allowed = new Set(allowedAgencyIds.filter(Boolean));
      const AgencyEmailSettings = (await import('../models/AgencyEmailSettings.model.js')).default;

      for (const a of agencies) {
        const agencyId = Number(a?.agencyId || 0);
        if (!agencyId || !allowed.has(agencyId)) continue;
        await AgencyEmailSettings.update({
          agencyId,
          notificationsEnabled: a.notificationsEnabled !== false,
          schoolRoiEmailsRequireApproval: a.schoolRoiEmailsRequireApproval !== false,
          aiDraftPolicyMode: normalizeEmailAiPolicyMode(a.aiDraftPolicyMode || 'human_only'),
          allowSchoolOverrides: a.allowSchoolOverrides !== false,
          aiAllowedIntents: normalizeEmailAiIntentClasses(a.aiAllowedIntentClasses || ['school_status_request']),
          aiMatchConfidenceThreshold: normalizeEmailAiConfidenceThreshold(a.aiMatchConfidenceThreshold ?? 0.75),
          aiAllowedSenderIdentityKeys: normalizeSenderIdentityKeys(a.aiAllowedSenderIdentityKeys || []),
          defaultSenderIdentityId: a.defaultSenderIdentityId === null || a.defaultSenderIdentityId === undefined || a.defaultSenderIdentityId === ''
            ? null
            : Number(a.defaultSenderIdentityId),
          templateSenderIdentityJson: a.templateSenderIdentityIds
            ? normalizeTemplateSenderIdentityJson(a.templateSenderIdentityIds)
            : undefined,
          personalEmailDigestEnabled: a.personalEmailDigestEnabled,
          personalEmailDigestBusinessHours: a.personalEmailDigestBusinessHours,
          holdStaffSchoolOutsideAvailability: a.holdStaffSchoolOutsideAvailability,
          clientOooAutoReplyEnabled: a.clientOooAutoReplyEnabled,
          clientOooTemplate: a.clientOooTemplate,
          clientOooSupportKeyword: a.clientOooSupportKeyword,
          unknownSenderBoxEnabled: a.unknownSenderBoxEnabled,
          secureMessageSenderIdentityId: a.secureMessageSenderIdentityId,
          noreplySenderIdentityId: a.noreplySenderIdentityId,
          intentReviewEnabled: a.intentReviewEnabled,
          intentConfidenceThreshold: a.intentConfidenceThreshold,
          quickViewEnabled: a.quickViewEnabled,
          secureClientMessageEmailEnabled: a.secureClientMessageEmailEnabled,
          actorUserId: req.user.id
        });
      }
    }

    const schoolOverrides = Array.isArray(req.body?.schoolOverrides) ? req.body.schoolOverrides : [];
    if (schoolOverrides.length > 0) {
      const allowedAgencyIds = userRole === 'super_admin'
        ? schoolOverrides.map((o) => Number(o.agencyId))
        : (await User.getAgencies(req.user.id)).map((a) => Number(a.id));
      const allowed = new Set(allowedAgencyIds.filter(Boolean));
      for (const o of schoolOverrides) {
        const agencyId = Number(o?.agencyId || 0);
        const schoolOrganizationId = Number(o?.schoolOrganizationId || 0);
        const remove = o?.remove === true;
        if (!agencyId || !schoolOrganizationId || !allowed.has(agencyId)) continue;
        if (remove) {
          await removeSchoolEmailAiPolicyOverride(schoolOrganizationId);
          continue;
        }
        await upsertSchoolEmailAiPolicyOverride({
          agencyId,
          schoolOrganizationId,
          policyMode: normalizeEmailAiPolicyMode(o?.policyMode || 'human_only'),
          allowedIntentClasses: Array.isArray(o?.allowedIntentClasses)
            ? normalizeEmailAiIntentClasses(o.allowedIntentClasses)
            : null,
          matchConfidenceThreshold: o?.matchConfidenceThreshold === undefined || o?.matchConfidenceThreshold === null
            ? null
            : normalizeEmailAiConfidenceThreshold(o.matchConfidenceThreshold),
          allowedSenderIdentityKeys: Array.isArray(o?.allowedSenderIdentityKeys)
            ? normalizeSenderIdentityKeys(o.allowedSenderIdentityKeys)
            : null,
          isActive: o?.isActive !== false,
          updatedByUserId: req.user.id
        });
      }
    }

    const platformSettings = updatedPlatform || await getPlatformEmailSettings();
    res.json({
      platform: {
        sendingMode: platformSettings.sendingMode,
        notificationsEnabled: platformSettings.notificationsEnabled
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getHtmlEmailChrome = async (req, res, next) => {
  try {
    const agencyId = Number(req.query?.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const { resolveTenantEmailChrome } = await import('../services/tenantEmailChrome.service.js');
    const chrome = await resolveTenantEmailChrome(agencyId);
    res.json({ agencyId, ...chrome });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/email-settings/html-chrome/:kind  kind = header|footer
 * multipart field: file
 * query/body: agencyId
 */
export const uploadHtmlEmailChrome = async (req, res, next) => {
  try {
    const kind = String(req.params?.kind || '').toLowerCase();
    if (!['header', 'footer'].includes(kind)) {
      return res.status(400).json({ error: { message: 'kind must be header or footer' } });
    }
    const agencyId = Number(req.body?.agencyId || req.query?.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!req.file) return res.status(400).json({ error: { message: 'No file uploaded' } });

    const path = await import('path');
    const StorageService = (await import('../services/storage.service.js')).default;
    const ext = path.extname(req.file.originalname || '') || '.png';
    const filename = `email-${kind}-${agencyId}-${Date.now()}${ext}`;
    const storageResult = await StorageService.saveLogo(req.file.buffer, filename, req.file.mimetype);
    const filePath = storageResult.relativePath || '';
    const publicRel = String(filePath).startsWith('uploads/')
      ? String(filePath).substring('uploads/'.length)
      : String(filePath);
    const url = `/uploads/${publicRel}`;

    const { updateAgencyHtmlEmailChrome } = await import('../services/tenantEmailChrome.service.js');
    const chrome = await updateAgencyHtmlEmailChrome(agencyId, {
      ...(kind === 'header' ? { headerUrl: url } : { footerUrl: url })
    });

    res.json({ ok: true, kind, url, chrome });
  } catch (e) {
    next(e);
  }
};
